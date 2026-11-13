"""Task Celery: detecção de IA."""

import uuid
from datetime import UTC, datetime

from app.core.db import SessionLocal
from app.models import Job, JobKind, JobStatus
from app.services import DetectionError, detect
from app.services.credits import InsufficientCredits, charge, refund
from app.worker.celery_app import celery_app


@celery_app.task(
    bind=True,
    autoretry_for=(DetectionError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_kwargs={"max_retries": 3},
)
def detect_task(self, job_id: str) -> dict:
    """Executa detecção de IA e atualiza o Job.

    Retry automático em DetectionError(retryable=True).
    Em falha definitiva: marca job como FAILED, estorna créditos.
    """
    db = SessionLocal()
    try:
        job = db.get(Job, uuid.UUID(job_id))
        if job is None:
            raise ValueError(f"Job {job_id} não encontrado")

        if job.kind != JobKind.DETECT:
            raise ValueError(f"Job {job_id} não é do tipo detect")

        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(UTC)
        db.commit()

        # Debita créditos (custo = palavras * 0.5)
        charge(db, job.user_id, job.words_processed, "detect", job.id)
        db.commit()

        # Executa detecção
        result = detect.detect(job.input_text)

        job.result = result.to_dict()
        job.ai_score = result.ai_probability
        job.words_processed = result.words_analyzed
        job.credits_charged = int(job.words_processed * 0.5)
        job.status = JobStatus.DONE
        job.finished_at = datetime.now(UTC)
        db.commit()

        return {
            "status": "done",
            "job_id": job_id,
            "ai_probability": result.ai_probability,
            "confidence": result.confidence,
        }

    except InsufficientCredits as exc:
        db.rollback()
        job = db.get(Job, uuid.UUID(job_id))
        if job:
            job.status = JobStatus.FAILED
            job.error = f"Créditos insuficientes: {exc}"
            job.finished_at = datetime.now(UTC)
            db.commit()
        return {"status": "failed", "job_id": job_id, "error": str(exc)}

    except DetectionError as exc:
        if not exc.retryable:
            db.rollback()
            job = db.get(Job, uuid.UUID(job_id))
            if job:
                job.status = JobStatus.FAILED
                job.error = str(exc)
                job.finished_at = datetime.now(UTC)
                if job.credits_charged > 0:
                    refund(db, job.user_id, job.credits_charged, job.id)
                db.commit()
            return {"status": "failed", "job_id": job_id, "error": str(exc)}
        raise

    except Exception as exc:
        db.rollback()
        job = db.get(Job, uuid.UUID(job_id))
        if job:
            job.status = JobStatus.FAILED
            job.error = f"Erro inesperado: {exc}"
            job.finished_at = datetime.now(UTC)
            if job.credits_charged > 0:
                refund(db, job.user_id, job.credits_charged, job.id)
            db.commit()
        return {"status": "failed", "job_id": job_id, "error": str(exc)}

    finally:
        db.close()