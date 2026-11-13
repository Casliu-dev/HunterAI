"""Rotas de documentos: upload, listagem, download, exclusão."""

import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models import Document
from app.schemas.documents import DocumentList, DocumentOut
from app.services import ExtractionError, extract, sanitize_file

router = APIRouter(tags=["documents"])


def _storage_path(user_id: uuid.UUID, doc_id: uuid.UUID, filename: str) -> Path:
    """Caminho: storage/{user_id}/{doc_id}_{safe_filename}"""
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)
    return settings.storage_dir / str(user_id) / f"{doc_id}_{safe}"


@router.post("/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
) -> DocumentOut:
    """Faz upload, extrai texto, sanitiza e salva Document."""
    data = await file.read()

    # Extrai texto (valida tipo, tamanho, senha, etc.)
    try:
        extracted = extract.extract(data, file.filename or "arquivo")
    except ExtractionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    # Sanitiza o arquivo original (remove metadados, invisíveis, etc.)
    try:
        sanitized = sanitize_file.sanitize_file(data, file.filename or "arquivo")
    except ExtractionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    # Salva arquivo sanitizado no storage
    doc_id = uuid.uuid4()
    path = _storage_path(user.id, doc_id, file.filename or "arquivo")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(sanitized.data)

    # Cria registro no banco
    doc = Document(
        id=doc_id,
        user_id=user.id,
        filename=file.filename or "arquivo",
        mime_type=extracted.mime_type,
        size_bytes=len(sanitized.data),
        storage_path=str(path),
        extracted_text=extracted.text,
        word_count=extracted.word_count,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return DocumentOut.model_validate(doc)


@router.get("/documents", response_model=DocumentList)
def list_documents(
    user: CurrentUser,
    db: DbSession,
    limit: int = 50,
    offset: int = 0,
) -> DocumentList:
    """Lista documentos do usuário (paginado)."""
    stmt = (
        select(Document)
        .where(Document.user_id == user.id)
        .order_by(Document.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    docs = db.execute(stmt).scalars().all()
    total = db.execute(
        select(Document).where(Document.user_id == user.id)
    ).scalars().all().__len__()  # FIXME: usar count() separado

    return DocumentList(items=docs, total=total, limit=limit, offset=offset)


@router.get("/documents/{doc_id}", response_model=DocumentOut)
def get_document(
    doc_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> DocumentOut:
    """Detalhes de um documento (sem o texto extraído completo)."""
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado")
    return DocumentOut.model_validate(doc)


@router.get("/documents/{doc_id}/text")
def get_document_text(
    doc_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, str]:
    """Retorna o texto extraído completo (para preview no dashboard)."""
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado")
    return {"text": doc.extracted_text}


@router.get("/documents/{doc_id}/download")
def download_document(
    doc_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> FileResponse:
    """Download do arquivo sanitizado."""
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado")

    path = Path(doc.storage_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado no storage")

    return FileResponse(
        path,
        media_type=doc.mime_type,
        filename=doc.filename,
    )


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Exclui documento (banco + arquivo no storage)."""
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado")

    # Remove arquivo do storage
    path = Path(doc.storage_path)
    if path.exists():
        path.unlink()

    db.delete(doc)
    db.commit()