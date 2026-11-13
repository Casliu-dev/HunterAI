"""Tasks Celery: billing (renovação de cotas, webhooks Stripe)."""

from app.core.db import SessionLocal
from app.models import User
from app.services import credits
from app.worker.celery_app import celery_app


@celery_app.task(bind=True)
def renew_plan_quotas(self) -> dict:
    """Renova a cota mensal de todos os usuários ativos.

    Roda via beat schedule (03:00 UTC). Em produção, idealmente
    sincroniza com o ciclo do Stripe (current_period_end).
    """
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active.is_(True)).all()
        renewed = 0
        for user in users:
            credits.grant_plan_quota(db, user, reason="monthly_renewal")
            renewed += 1
        db.commit()
        return {"status": "done", "renewed": renewed}
    except Exception as exc:
        db.rollback()
        return {"status": "failed", "error": str(exc)}
    finally:
        db.close()


@celery_app.task(bind=True)
def handle_stripe_webhook(self, event_type: str, event_data: dict) -> dict:
    """Processa webhook do Stripe (assinatura verificada no endpoint HTTP).

    Eventos principais:
    - invoice.payment_succeeded → renova cota / upgrade plan
    - customer.subscription.deleted → downgrade para FREE
    - invoice.payment_failed → marca past_due, notifica usuário
    """
    # TODO: implementar lógica baseada no event_type
    # Por enquanto só loga
    return {"status": "received", "event_type": event_type}