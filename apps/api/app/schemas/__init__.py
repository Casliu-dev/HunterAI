"""Schemas Pydantic (I/O da API)."""

from app.schemas.auth import (
    LoginRequest,
    MeOut,
    RefreshRequest,
    SignupRequest,
    TokenPair,
    UserOut,
)
from app.schemas.documents import DocumentList, DocumentOut
from app.schemas.jobs import (
    DetectRequest,
    HumanizeRequest,
    JobCreateResponse,
    JobDetail,
    JobKind,
    JobOut,
    JobStatus,
    SanitizeRequest,
)

__all__ = [
    # auth
    "SignupRequest",
    "LoginRequest",
    "RefreshRequest",
    "TokenPair",
    "UserOut",
    "MeOut",
    # documents
    "DocumentOut",
    "DocumentList",
    # jobs
    "JobKind",
    "JobStatus",
    "HumanizeRequest",
    "DetectRequest",
    "SanitizeRequest",
    "JobCreateResponse",
    "JobOut",
    "JobDetail",
]