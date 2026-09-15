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
apps/api/app/
├── main.py              FastAPI app, CORS, /health
├── core/                config, db, security (JWT/bcrypt), deps
├── models/              SQLAlchemy: user, billing, job
├── schemas/             Pydantic I/O
├── api/v1/              routers
├── services/            regra de negócio (credits, humanizer, detector, …)
└── worker/              Celery
apps/web/                (ainda não criado)
```

## Ambiente desta máquina — ATENÇÃO

Não há **Python** nem **Docker** instalados. Há Node 24, npm 11 e git.
Para rodar o backend é preciso um dos dois:

- **Docker Desktop** (recomendado — o `docker-compose.yml` sobe postgres, redis,
  api e worker de uma vez), ou
- **Python 3.12** local + Postgres + Redis por fora.

Nenhum comando Python foi executado ainda; o código não foi testado em runtime.

## Estado atual

**Pronto**
- `docker-compose.yml`, `.env.example`, `Dockerfile`, `pyproject.toml`
- `core/`: config (pydantic-settings), db (sessão por request), security, deps
- `models/`: User, RefreshToken, Subscription, CreditLedger, Document, Job
- `schemas/auth.py`, `services/credits.py`
- `api/v1/auth.py`: signup, login, refresh (com rotação), logout, me
- `main.py` + `/health`

**Falta**
1. **Alembic** — `alembic.ini`, `alembic/env.py` e a migration inicial. Nada foi
   gerado ainda; o `docker-compose` já chama `alembic upgrade head` e vai falhar
   sem isso. *Este é o próximo passo.*
2. `services/extract.py` — `.docx` / `.pdf` / `.txt` → texto
3. `services/sanitize.py` — limpeza de vestígios do arquivo (ver abaixo)
4. `services/humanizer.py` — pipeline de reescrita com Claude
5. `services/detector.py` — perplexidade + burstiness
6. `worker/` — Celery app e tasks
7. `api/v1/`: documents, humanize, detect, billing (webhook Stripe)
8. `apps/web/` — dashboard React inteiro
9. Testes

### Notas de implementação para o que falta

**`sanitize.py`** — é a parte mais determinística e a de maior retorno, porque não
gasta token: remover zero-width (`U+200B`, `U+200C`, `U+FEFF`), normalizar aspas
curvas e travessões, limpar `docProps/core.xml` do `.docx` (`author`,
`lastModifiedBy`, `created`, `modified`, `revision`) e o `/Info` + XMP do PDF.

**`humanizer.py`** — quebre por parágrafo, não por caractere: cortar no meio de uma
frase destrói a coerência. O system prompt é estável entre requisições, então marque
`cache_control={"type": "ephemeral"}` (só entra em vigor acima do prefixo mínimo
do modelo). Nunca truncar entrada em silêncio: se não couber, chunk.

**`detector.py`** — os pesos do classificador precisam ser calibrados contra um
corpus rotulado em PT-BR. Qualquer peso que entre no código antes disso é um chute
e deve estar comentado como tal. A saída é probabilidade com faixa de confiança e
trechos destacados — **nunca** um veredito binário.

## Convenções

- Comentários e mensagens de erro da API em **português**; nomes de código em inglês.
- Mensagens de erro de auth nunca revelam se o e-mail existe.
- `ruff` com `line-length = 100`.
- Migrations sempre via Alembic — nada de `Base.metadata.create_all()`.
