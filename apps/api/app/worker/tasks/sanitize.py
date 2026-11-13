"""Task Celery: sanitização de arquivo."""

import uuid
from datetime import UTC, datetime

from app.core.db import SessionLocal
from app.models import Job, JobKind, JobStatus
from app.services import sanitize_file, sanitize_text
from app.services.extract import ExtractionError
from app.worker.celery_app import celery_app


@celery_app.task(
    bind=True,
    autoretry_for=(ExtractionError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_kwargs={"max_retries": 2},
)
def sanitize_task(self, job_id: str) -> dict:
    """Executa sanitização de arquivo e atualiza o Job.

    O input_text do job contém o texto JÁ EXTRAÍDO (para sanitize_text)
    OU o job.params contém storage_path + filename (para sanitize_file).
    """
    db = SessionLocal()
    try:
        job = db.get(Job, uuid.UUID(job_id))
        if job is None:
            raise ValueError(f"Job {job_id} não encontrado")

        if job.kind != JobKind.SANITIZE:
            raise ValueError(f"Job {job_id} não é do tipo sanitize")

        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(UTC)
        db.commit()

        # Dois modos:
        # 1. sanitize_file: params tem storage_path + filename
        # 2. sanitize_text: input_text já tem o texto
        storage_path = job.params.get("storage_path")
        filename = job.params.get("filename", "arquivo.txt")

        if storage_path:
            # Lê arquivo do storage, sanitiza, salva de volta
            import pathlib

            path = pathlib.Path(storage_path)
            if not path.exists():
                raise FileNotFoundError(f"Arquivo não encontrado: {storage_path}")

            data = path.read_bytes()
            sanitized = sanitize_file.sanitize_file(data, filename)

            # Sobrescreve o arquivo original com versão sanitizada
            path.write_bytes(sanitized.data)

            job.result = sanitized.report.to_dict()
            job.words_processed = 0  # sanitize não processa palavras
            job.credits_charged = 0  # sanitize é grátis
        else:
            # Sanitiza só o texto (já extraído)
            text, changes = sanitize_text.sanitize_text(job.input_text)
            job.result = {
                "text": text,
                "report": changes.__dict__ if hasattr(changes, "__dict__") else str(changes),
            }
            job.words_processed = 0
            job.credits_charged = 0

        job.status = JobStatus.DONE
        job.finished_at = datetime.now(UTC)
        db.commit()

        return {"status": "done", "job_id": job_id}

    except ExtractionError as exc:
        if "senha" in str(exc).lower() or "corrompido" in str(exc).lower():
            # Não adianta retry: arquivo inválido
            db.rollback()
            job = db.get(Job, uuid.UUID(job_id))
            if job:
                job.status = JobStatus.FAILED
                job.error = str(exc)
                job.finished_at = datetime.now(UTC)
                db.commit()
            return {"status": "failed", "job_id": job_id, "error": str(exc)}
        # Outros erros de extração: retry
        raise

    except Exception as exc:
        db.rollback()
        job = db.get(Job, uuid.UUID(job_id))
        if job:
            job.status = JobStatus.FAILED
            job.error = f"Erro inesperado: {exc}"
            job.finished_at = datetime.now(UTC)
            db.commit()
        return {"status": "failed", "job_id": job_id, "error": str(exc)}

    finally:
        db.close()