"""Regras de crédito.

A unidade é PALAVRA. Cada plano concede uma cota mensal; humanizar N palavras
debita N créditos, detectar debita a metade (custa bem menos para rodar).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CreditLedger, Plan, User

# Cota mensal por plano, em palavras.
PLAN_QUOTA: dict[Plan, int] = {
    Plan.FREE: 500,
    Plan.STARTER: 15_000,
    Plan.PRO: 60_000,
}

DETECT_COST_RATIO = 0.5


class InsufficientCredits(Exception):
    def __init__(self, needed: int, available: int) -> None:
        self.needed = needed
        self.available = available
        super().__init__(f"Créditos insuficientes: precisa de {needed}, tem {available}")


def balance(db: Session, user_id: uuid.UUID) -> int:
    row = db.execute(
        select(CreditLedger.balance_after)
        .where(CreditLedger.user_id == user_id)
        .order_by(CreditLedger.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    return row or 0


def _append(
    db: Session,
    user_id: uuid.UUID,
    delta: int,
    reason: str,
    ref_type: str | None = None,
    ref_id: str | None = None,
) -> CreditLedger:
    current = balance(db, user_id)
    entry = CreditLedger(
        user_id=user_id,
        delta=delta,
        balance_after=current + delta,
        reason=reason,
        ref_type=ref_type,
        ref_id=ref_id,
        created_at=datetime.now(UTC),
    )
    db.add(entry)
    return entry


def grant_plan_quota(db: Session, user: User, reason: str = "plan_renewal") -> CreditLedger:
    """Credita a cota do plano. Chamado no signup e a cada ciclo do Stripe."""
    return _append(db, user.id, PLAN_QUOTA[user.plan], reason)


def charge(
    db: Session,
    user_id: uuid.UUID,
    words: int,
    kind: str,
    job_id: uuid.UUID,
) -> CreditLedger:
    cost = words if kind == "humanize" else int(words * DETECT_COST_RATIO)
    available = balance(db, user_id)
    if cost > available:
        raise InsufficientCredits(cost, available)
    return _append(db, user_id, -cost, f"{kind}_charge", "job", str(job_id))


def refund(db: Session, user_id: uuid.UUID, amount: int, job_id: uuid.UUID) -> CreditLedger:
    """Devolve créditos quando um job falha por erro nosso."""
    return _append(db, user_id, amount, "job_refund", "job", str(job_id))
