"""App Celery — tarefas assíncronas de humanização, detecção e sanitização.

Configuração:
- Broker: Redis (settings.redis_url)
- Backend: Redis (mesmo)
- Serialização: JSON
- Timezone: UTC
- Task acks late + reject on worker lost (para não perder jobs em crash)
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "hunterai",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.worker.tasks.humanize",
        "app.worker.tasks.detect",
        "app.worker.tasks.sanitize",
        "app.worker.tasks.billing",
        "app.worker.tasks.auth",
    ],
)

# Força import dos módulos de tasks para registrar as tasks (depois de criar celery_app)
import app.worker.tasks.auth  # noqa: F401,E402
import app.worker.tasks.billing  # noqa: F401,E402
import app.worker.tasks.detect  # noqa: F401,E402
import app.worker.tasks.humanize  # noqa: F401,E402
import app.worker.tasks.sanitize  # noqa: F401,E402

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Confiabilidade
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Prefetch: 1 por worker para balancear chunks pesados de humanize
    worker_prefetch_multiplier=1,
    # Resultado expira em 24h
    result_expires=86400,
    # Retry policy padrão
    task_default_retry_delay=60,
    task_max_retries=3,
    # Beat schedule (para renovação de cotas, limpeza, etc.)
    beat_schedule={
        "renew-plan-quotas": {
            "task": "app.worker.tasks.billing.renew_plan_quotas",
            "schedule": crontab(hour=3, minute=0),  # 03:00 UTC
        },
        "cleanup-expired-refresh-tokens": {
            "task": "app.worker.tasks.auth.cleanup_expired_refresh_tokens",
            "schedule": crontab(hour=4, minute=0),
        },
    },
)

# Tasks registradas via import explícito acima (mais confiável que autodiscover)