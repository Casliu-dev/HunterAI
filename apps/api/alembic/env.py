"""Ambiente de migrations.

Dois pontos importantes:

1. A URL vem de `settings.database_url`, nunca do `alembic.ini`. A URL pode
   conter `%` (senha com escape de URL) e o ConfigParser do ini trataria isso
   como interpolação — por isso o engine é montado na mão, sem passar pelo ini.
2. `app.models` é importado inteiro para que `Base.metadata` esteja completo no
   autogenerate. Importar só `Base` gera migrations vazias.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import settings

# Importar de `app.models` (e não de `app.models.base`) executa o __init__ do
# pacote, que registra User, RefreshToken, Subscription, CreditLedger, Document
# e Job em Base.metadata.
from app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Gera o SQL sem conectar no banco (`alembic upgrade head --sql`)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(settings.database_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
