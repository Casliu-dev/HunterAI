"""Schemas de jobs (humanize, detect, sanitize)."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class JobKind(StrEnum):
    HUMANIZE = "humanize"
    DETECT = "detect"
    SANITIZE = "sanitize"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class HumanizeRequest(BaseModel):
    document_id: uuid.UUID
    tone: str = Field(default="academico", pattern="^(academico|neutro|informal)$")
    paid: bool = True


class DetectRequest(BaseModel):
    document_id: uuid.UUID


class SanitizeRequest(BaseModel):
    document_id: uuid.UUID


class JobCreateResponse(BaseModel):
    job_id: uuid.UUID
    status: JobStatus
    message: str


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: JobKind
    status: JobStatus
    document_id: uuid.UUID | None
    words_processed: int
    credits_charged: int
    ai_score: float | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class JobDetail(JobOut):
    input_text: str
    params: dict[str, Any]
    result: dict[str, Any] | None