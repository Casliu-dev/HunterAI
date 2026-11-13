"""Rota de sanitização: enfileira job para o worker."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models import Document, Job, JobKind, JobStatus
from app.schemas.jobs import SanitizeRequest, JobCreateResponse, JobDetail, JobOut
from app.worker.celery_app import celery_app

router = APIRouter(tags=["sanitize"])


@router.post("/sanitize", response_model=JobCreateResponse, status_code=status.HTTP_202_ACCEPTED)
def create_sanitize_job(
    payload: SanitizeRequest,
    user: CurrentUser,
    db: DbSession,
) -> JobCreateResponse:
    """Cria job de sanitização e enfileira no Celery (grátis, não consome créditos)."""
    # Verifica documento
    doc = db.get(Document, payload.document_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado")

    # Cria job
    job = Job(
        user_id=user.id,
        document_id=doc.id,
        kind=JobKind.SANITIZE,
        status=JobStatus.QUEUED,
        input_text=doc.extracted_text,
        params={},
        words_processed=doc.word_count,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Enfileira no worker
    celery_app.send_task("app.worker.tasks.sanitize.sanitize_task", args=[str(job.id)])

    return JobCreateResponse(
        job_id=job.id,
        status=JobStatus.QUEUED,
        message="Job enfileirado. Use GET /v1/sanitize/{id} para acompanhar.",
    )


@router.get("/sanitize/{job_id}", response_model=JobDetail)
def get_sanitize_job(
    job_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> JobDetail:
    """Detalhes do job de sanitização (inclui resultado completo)."""
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id or job.kind != JobKind.SANITIZE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job não encontrado")
    return JobDetail.model_validate(job)


@router.get("/sanitize", response_model=list[JobOut])
def list_sanitize_jobs(
    user: CurrentUser,
    db: DbSession,
    limit: int = 20,
    offset: int = 0,
) -> list[JobOut]:
    """Lista jobs de sanitização do usuário."""

    stmt = (
        select(Job)
        .where(Job.user_id == user.id, Job.kind == JobKind.SANITIZE)
        .order_by(Job.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    jobs = db.execute(stmt).scalars().all()
    return [JobOut.model_validate(j) for j in jobs]