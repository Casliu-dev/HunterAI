# HunterAI

SaaS de reescrita e análise de texto para estudantes — humanizador, limpeza de
vestígios em arquivos e detector de IA, num dashboard só.

> Arquitetura, decisões e estado do projeto: [`CLAUDE.md`](CLAUDE.md).

## Requisitos

- Docker Desktop **ou** Python 3.12 + PostgreSQL 16 + Redis 7
- Node 20+ (para o dashboard, ainda não criado)
- Uma `ANTHROPIC_API_KEY`

## Rodando com Docker

```bash
cp .env.example .env
```

Preencha `ANTHROPIC_API_KEY` e `SECRET_KEY` no `.env`, e então:

```bash
docker compose up --build
```

- API: http://localhost:8000
- Documentação interativa: http://localhost:8000/docs
- Healthcheck: http://localhost:8000/health

## Rodando sem Docker

Com Postgres e Redis já no ar:

```bash
cd apps/api && pip install -e ".[dev]" && alembic upgrade head
```

Em um terminal, a API:

```bash
uvicorn app.main:app --reload
```

Em outro, o worker:

```bash
celery -A app.worker.celery_app.celery worker --loglevel=info
```

## Detector neural (opcional)

As heurísticas estatísticas rodam sem dependência extra. Para ativar também a
perplexidade, instale o extra — são ~2 GB por causa do torch:

```bash
pip install -e ".[detector]"
```

Sem ele, deixe `DETECTOR_MODEL` vazio no `.env` e o serviço cai para as
heurísticas puras.

## Estrutura

```
apps/api/    FastAPI + Celery
apps/web/    dashboard React (a criar)
```
