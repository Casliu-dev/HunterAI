"""Rotas de billing: webhook Stripe, portal do cliente, checkout."""

import stripe
from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models import Subscription, SubscriptionStatus
from app.worker.celery_app import celery_app

router = APIRouter(tags=["billing"])

stripe.api_key = settings.stripe_secret_key


@router.post("/billing/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    db: DbSession,
) -> dict[str, str]:
    """Recebe webhooks do Stripe (assinatura verificada).

    Eventos tratados:
    - invoice.payment_succeeded → renova cota / upgrade plan
    - customer.subscription.updated → sincroniza status/plan
    - customer.subscription.deleted → downgrade para FREE
    - invoice.payment_failed → marca past_due
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assinatura inválida") from exc

    # Delega processamento assíncrono para o worker (não bloqueia webhook)
    celery_app.send_task(
        "app.worker.tasks.billing.handle_stripe_webhook",
        args=[event["type"], event["data"]["object"]],
    )

    return {"received": True}


@router.post("/billing/checkout", status_code=status.HTTP_201_CREATED)
def create_checkout_session(
    price_id: str,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, str]:
    """Cria sessão de Checkout do Stripe para assinatura.

    Frontend redireciona usuário para `url` retornada.
    """
    if not user.stripe_customer_id:
        customer = stripe.Customer.create(email=user.email, metadata={"user_id": str(user.id)})
        user.stripe_customer_id = customer.id
        db.commit()

    session = stripe.checkout.Session.create(
        customer=user.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.web_base_url}/dashboard?checkout=success",
        cancel_url=f"{settings.web_base_url}/dashboard?checkout=canceled",
        metadata={"user_id": str(user.id)},
    )
    return {"url": session.url}


@router.post("/billing/portal", status_code=status.HTTP_201_CREATED)
def create_portal_session(
    user: CurrentUser,
) -> dict[str, str]:
    """Cria sessão do Customer Portal (gerenciar assinatura, faturas, pagamento)."""
    if not user.stripe_customer_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cliente Stripe não encontrado")

    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.web_base_url}/dashboard",
    )
    return {"url": session.url}


@router.get("/billing/subscription")
def get_subscription(
    user: CurrentUser,
    db: DbSession,
) -> dict | None:
    """Retorna assinatura ativa do usuário (se houver)."""
    from sqlalchemy import select

    sub = db.execute(
        select(Subscription)
        .where(Subscription.user_id == user.id, Subscription.status != SubscriptionStatus.CANCELED)
        .order_by(Subscription.created_at.desc())
    ).scalar_one_or_none()

    if not sub:
        return None

    return {
        "plan": sub.plan,
        "status": sub.status,
        "current_period_end": sub.current_period_end,
        "cancel_at_period_end": sub.cancel_at_period_end,
    }