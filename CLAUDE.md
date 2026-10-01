# HunterAI — contexto do projeto

> Este arquivo é lido automaticamente pelo Claude Code ao abrir o repositório.
> Mantenha-o atualizado quando decisões de arquitetura mudarem.

## O que é

SaaS de **reescrita e análise de texto** para estudantes, em português do Brasil.
Três produtos dentro de um dashboard:

1. **Humanizador** — reescreve texto gerado por IA para soar natural e pessoal.
2. **Limpeza de vestígios** — remove marcas de origem no *arquivo*: caracteres
   invisíveis, tipografia colada, metadados de `.docx` e `.pdf`.
3. **Detector de IA** — estima a probabilidade de um texto ter sido gerado por IA,
   com trechos destacados.

### Posicionamento (importante, não é detalhe de marketing)

A Stripe lista *academic fraud / essay mills* entre as atividades restritas. O copy
do produto **nunca** deve prometer "burlar o detector do professor". O
enquadramento adotado é: ferramenta de reescrita e edição, mais verificação de
**falso-positivo** para o aluno que escreveu o próprio texto e foi acusado
injustamente. Mesma funcionalidade, sem risco de encerramento da conta Stripe.

## Stack

| Camada | Escolha |
|---|---|
| Frontend | React 19 + Vite + TypeScript, Tailwind, shadcn/ui, TanStack Query |
| Backend | FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 |
| Banco | PostgreSQL 16 |
| Fila | Celery + Redis |
| LLM | Claude via SDK `anthropic` (Python) |
| Pagamento | Stripe Checkout + webhooks |

### Decisões já tomadas (e o porquê)

- **FastAPI, não Django** — as chamadas de LLM são I/O longo; async importa. E o
  OpenAPI gerado alimenta os tipos do frontend.
- **Auth própria (JWT + refresh opaco), não Clerk/Supabase** — sem custo por MAU e
  o usuário é a fonte de verdade única, junto do `stripe_customer_id` e do ledger.
  O refresh token é opaco (não JWT) e guardado como hash: revogar é uma linha no
  banco, sem blacklist de JWT.
- **Detector próprio (perplexidade + burstiness), não API de terceiro** — sem custo
  por chamada, e explicável: dá para destacar quais trechos puxaram o score.
- **Modelos Claude** — `claude-sonnet-5` nos planos pagos, `claude-haiku-4-5` no
  gratuito. Configurável por env (`HUMANIZE_MODEL`, `HUMANIZE_MODEL_FREE`).
  Na reescrita, use `thinking={"type": "disabled"}` e `output_config={"effort": "low"}`:
  é tarefa de reescrita, não de raciocínio — thinking só queimaria token.
- **Créditos em PALAVRAS, em ledger append-only** — nunca sobrescreva saldo, só
  insira linhas em `credit_ledger`. `balance_after` é cache de leitura/auditoria.
  Humanizar debita N palavras; detectar debita N/2.
- **Uma tabela `jobs` para humanize e detect**, com `kind` + `result` JSONB, e as
  colunas `ai_score` / `words_processed` promovidas para o dashboard não abrir o
  JSONB em toda consulta.

## Estrutura

```
apps/api/
├── alembic.ini          script_location=alembic, prepend_sys_path=.
├── alembic/
│   ├── env.py           URL vem de settings, não do .ini
│   └── versions/        0001 = schema inicial
└── app/
    ├── main.py          FastAPI app, CORS, /health
    ├── core/            config, db, security (JWT/bcrypt), deps
    ├── models/          SQLAlchemy: user, billing, job
    ├── schemas/         Pydantic I/O
    ├── api/v1/          routers
    ├── services/        regra de negócio (credits, humanizer, detector, …)
    └── worker/          Celery
apps/web/                (ainda não criado)
```

## Ambiente desta máquina — ATENÇÃO

Node 24, npm 11, git e **Python 3.12.10** (`%LOCALAPPDATA%\Programs\Python\Python312`).
Venv do backend em `apps/api/.venv` (ignorada pelo git), com o projeto instalado
em modo editável. **Não há Docker, Postgres nem Redis.**

Cuidado: o `py` sozinho não basta — o Python Launcher é só um localizador, o
runtime é o pacote `Python.Python.3.12`. E após instalar algo no PATH, o Claude
Code precisa reiniciar para enxergar; até lá, chame pelo caminho absoluto.

```bash
cd apps/api
./.venv/Scripts/python.exe -m alembic upgrade head --sql   # não conecta no banco
./.venv/Scripts/python.exe -m ruff check .
```

Sem Postgres, o que dá para validar offline é: import da app, `--sql` de
upgrade/downgrade, ruff, e a paridade models↔migration (comparando o DDL de
`CreateTable` compilado no dialeto PG contra a saída do `--sql`). O que **não**
dá: `alembic check`, qualquer teste que toque o banco, e o Celery.

## Estado atual

**Pronto**
- `docker-compose.yml`, `.env.example`, `Dockerfile`, `pyproject.toml`
- `core/`: config (pydantic-settings), db (sessão por request), security, deps
- `models/`: User, RefreshToken, Subscription, CreditLedger, Document, Job
- `schemas/auth.py`, `services/credits.py`
- `services/extract.py` — `.docx`/`.pdf`/`.txt` → texto em parágrafos separados por
  linha em branco. Tipo detectado pelos bytes, não pela extensão. `count_words()`
  mora aqui e é a contagem oficial de crédito. Testes em `tests/test_extract.py`
  (não tocam o banco: `python -m pytest tests`).
- `services/sanitize.py` — `sanitize_text()` (invisíveis, espaços especiais, aspas,
  travessões, reticências) e `sanitize_file()` para `.txt`/`.docx`/`.pdf`, sempre com
  relatório do que mudou. No `.docx` limpa texto dos runs, `docProps/core.xml` e
  `app.xml`, autoria de revisões/comentários e datas do zip; no PDF só `/Info` + XMP
  (o texto do PDF não é reescrito — o relatório avisa).
- `services/humanizer.py` — `humanize(text, paid=, tone=)`: chunks de parágrafos
  inteiros (~600 palavras; parágrafo maior é dividido por frase), chunks em paralelo
  (4 threads), `max_tokens` estourado → divide o chunk e refaz. `HumanizeError` tem
  `retryable` para o worker decidir entre retry e estorno. Opções de thinking/effort
  por família de modelo em `_model_options()` (Haiku 4.5 recusa `effort`; Sonnet 5.5
  recusa `disabled`). Testado com cliente falso — **ainda não rodou contra a API**.
  O system prompt tem ~650 tokens, abaixo do mínimo de cache do Sonnet 5 (1.024):
  o `cache_control` está lá, mas hoje não tem efeito.
- `api/v1/auth.py`: signup, login, refresh (com rotação), logout, me
- `main.py` + `/health`
- **Alembic**: `alembic.ini`, `alembic/env.py`, `script.py.mako` e a migration
  inicial `0001` (as seis tabelas). Validada offline: o DDL gerado bate 1:1 com
  o dos models (16 statements), upgrade e downgrade compilam, ruff limpo. Ainda
  **não foi aplicada em banco de verdade** — falta rodar contra o Postgres.

**Falta**
1. `services/detector.py` — perplexidade + burstiness. *Próximo passo.*
2. `worker/` — Celery app e tasks
3. `api/v1/`: documents, humanize, detect, billing (webhook Stripe)
4. `apps/web/` — dashboard React inteiro
5. Testes dos demais serviços

### Notas de implementação para o que falta

**`detector.py`** — os pesos do classificador precisam ser calibrados contra um
corpus rotulado em PT-BR. Qualquer peso que entre no código antes disso é um chute
e deve estar comentado como tal. A saída é probabilidade com faixa de confiança e
trechos destacados — **nunca** um veredito binário.

## Convenções

- Comentários e mensagens de erro da API em **português**; nomes de código em inglês.
- Mensagens de erro de auth nunca revelam se o e-mail existe.
- `ruff` com `line-length = 100`.
- Migrations sempre via Alembic — nada de `Base.metadata.create_all()`.

### Migrations

Rodar de dentro de `apps/api/` (ou de `/app` no container, é o mesmo diretório):

```bash
alembic upgrade head                        # aplicar
alembic revision --autogenerate -m "msg"    # criar a partir dos models
alembic check                               # models e banco divergem?
alembic upgrade head --sql                  # só imprime o SQL, não conecta
```

- A `DATABASE_URL` é lida pelo `env.py` de `settings`, **não** do `alembic.ini`
  — senha não vai para o git, e `%` na senha não quebra a interpolação do ini.
- `env.py` importa de `app.models` (o `__init__`), não de `app.models.base`:
  importar só a `Base` deixaria o metadata vazio e o autogenerate mudo.
- Ao criar um model novo, exporte-o em `app/models/__init__.py` — é o que o
  autogenerate enxerga.
- Sempre **revise** o arquivo gerado: o autogenerate não detecta rename de
  coluna (vira drop + add, perde dado) nem mudança de `server_default` em tipo.

### Três ajustes no `pyproject.toml` que não devem ser revertidos

Os três vieram de falhas reais encontradas ao rodar o projeto pela primeira vez;
o diretório `alembic/` na raiz é a causa de dois deles.

1. `[tool.setuptools.packages.find] include = ["app*"]` — sem isso o setuptools
   vê `app/` e `alembic/` como dois pacotes top-level e **aborta o build**. Isso
   quebrava o `pip install -e .` do Dockerfile também.
2. `pydantic[email]` — `schemas/auth.py` usa `EmailStr`, que exige o
   `email-validator`. Sem o extra, o import de `app.main` levanta ImportError e
   a API não sobe.
3. `[tool.ruff.lint.isort] known-third-party = ["alembic"]` — sem isso o ruff
   confunde o diretório `alembic/` com o pacote e quer agrupar
   `from alembic import op` junto de `app.*`, em toda migration.
