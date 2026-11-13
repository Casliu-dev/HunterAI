"""Tasks Celery: auth (limpeza de tokens expirados)."""

from datetime import UTC, datetime

from app.core.db import SessionLocal
from app.models import RefreshToken
from app.worker.celery_app import celery_app


@celery_app.task(bind=True)
def cleanup_expired_refresh_tokens(self) -> dict:
    """Remove refresh tokens expirados ou revogados há mais de 7 dias.

    Roda via beat schedule (04:00 UTC).
    """
    db = SessionLocal()
    try:
        now = datetime.now(UTC)
        cutoff = now.replace(day=now.day - 7)  # 7 dias atrás

        # Deleta tokens revogados antes do cutoff OU expirados antes do cutoff
        deleted = (
            db.query(RefreshToken)
            .filter(
                (RefreshToken.revoked_at.isnot(None) & (RefreshToken.revoked_at < cutoff))
                | (RefreshToken.expires_at < cutoff)
            )
            .delete(synchronize_session=False)
        )
        db.commit()
        return {"status": "done", "deleted": deleted}
    except Exception as exc:
        db.rollback()
        return {"status": "failed", "error": str(exc)}
    finally:
        db.close()