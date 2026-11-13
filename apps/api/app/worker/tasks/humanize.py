"""Task Celery: humanização de texto."""

import uuid
from datetime import UTC, datetime

from app.core.db import SessionLocal
from app.models import Job, JobKind, JobStatus
from app.services import HumanizeError, humanize
from app.services.credits import InsufficientCredits, charge, refund
from app.worker.celery_app import celery_app


@celery_app.task(
    bind=True,
    autoretry_for=(HumanizeError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_kwargs={"max_retries": 3},
)
def humanize_task(self, job_id: str) -> dict:
    """Executa humanização e atualiza o Job.

    Retry automático em HumanizeError(retryable=True).
    Em falha definitiva: marca job como FAILED, estorna créditos.
    """
    db = SessionLocal()
    try:
        job = db.get(Job, uuid.UUID(job_id))
        if job is None:
            raise ValueError(f"Job {job_id} não encontrado")

        if job.kind != JobKind.HUMANIZE:
            raise ValueError(f"Job {job_id} não é do tipo humanize")

        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(UTC)
        db.commit()

        # Debita créditos (levanta InsufficientCredits se não tiver)
        charge(db, job.user_id, job.words_processed, "humanize", job.id)
        db.commit()

        # Executa humanização
        tone = job.params.get("tone", "academico")
        paid = job.params.get("paid", True)

        result = humanize.humanize(
            job.input_text,
            paid=paid,
            tone=humanize.Tone(tone),
        )

        job.result = result.to_dict()
        job.ai_score = None  # humanize não tem ai_score
        job.words_processed = result.output_words
        job.credits_charged = job.words_processed
        job.status = JobStatus.DONE
        job.finished_at = datetime.now(UTC)
        db.commit()

        return {"status": "done", "job_id": job_id, "words_out": result.output_words}

    except InsufficientCredits as exc:
        db.rollback()
        job = db.get(Job, uuid.UUID(job_id))
        if job:
            job.status = JobStatus.FAILED
            job.error = f"Créditos insuficientes: {exc}"
            job.finished_at = datetime.now(UTC)
            db.commit()
        return {"status": "failed", "job_id": job_id, "error": str(exc)}

    except HumanizeError as exc:
        # retryable=True → Celery retry automático (via autoretry_for)
        # retryable=False → falha definitiva
        if not exc.retryable:
            db.rollback()
            job = db.get(Job, uuid.UUID(job_id))
            if job:
                job.status = JobStatus.FAILED
                job.error = str(exc)
                job.finished_at = datetime.now(UTC)
                # Estorna créditos se já debitou
                if job.credits_charged > 0:
                    refund(db, job.user_id, job.credits_charged, job.id)
                db.commit()
            return {"status": "failed", "job_id": job_id, "error": str(exc)}
        # retryable: re-levanta para o Celery tentar de novo
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