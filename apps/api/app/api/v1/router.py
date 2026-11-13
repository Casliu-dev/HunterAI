from fastapi import APIRouter

from app.api.v1 import auth, billing, detect, documents, humanize, sanitize

api_router = APIRouter(prefix="/v1")
api_router.include_router(auth.router)
api_router.include_router(documents.router)
api_router.include_router(humanize.router)
api_router.include_router(detect.router)
api_router.include_router(sanitize.router)
api_router.include_router(billing.router)
