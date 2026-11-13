'use client'

import { useState } from 'react'
import { useSubscription, useCreateCheckout, useCreatePortal, useCreditBalance } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import {
  CreditCard,
  Loader2,
  CheckCircle,
  Crown,
  ArrowUpRight,
  Info,
  AlertCircle,
} from 'lucide-react'

const PLANS = [
  {
    id: 'free',
    name: 'Gratuito',
    price: 0,
    credits: 5000,
    model: 'Haiku 4.5',
    features: ['5.000 palavras/mês', 'Modelo Haiku 4.5', 'Detecção básica', 'Sanitização ilimitada'],
    priceId: null,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    credits: 100000,
    model: 'Sonnet 5',
    features: ['100.000 palavras/mês', 'Modelo Sonnet 5', 'Detecção avançada', 'Sanitização ilimitada', 'Prioridade na fila'],
    priceId: 'price_pro_monthly',
  },
  {
    id: 'team',
    name: 'Equipe',
    price: 149,
    credits: 500000,
    model: 'Sonnet 5',
    features: ['500.000 palavras/mês', 'Modelo Sonnet 5', 'Detecção avançada', 'Sanitização ilimitada', 'Prioridade na fila', 'Até 5 usuários', 'API access'],
    priceId: 'price_team_monthly',
  },
]

export function Billing() {
  const { data: subscription } = useSubscription()
  const { data: balance } = useCreditBalance()
  const checkoutMutation = useCreateCheckout()
  const portalMutation = useCreatePortal()
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  const currentPlan = subscription?.plan?.toLowerCase() || 'free'

  const handleCheckout = async (priceId: string) => {
    try {
      const result = await checkoutMutation.mutateAsync(priceId)
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      console.error('Erro no checkout:', error)
    }
  }

  const handlePortal = async () => {
    try {
      const result = await portalMutation.mutateAsync()
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      console.error('Erro no portal:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="text-primary" />
          Assinatura e Créditos
        </h1>
        <p className="text-muted-foreground">Gerencie seu plano e acompanhe seus créditos</p>
      </div>

      {/* Current Plan & Credits */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Plano Atual</p>
                <p className="font-bold capitalize">{currentPlan}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Créditos Disponíveis</p>
                <p className="font-bold text-2xl">{balance?.balance?.toLocaleString('pt-BR') || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {subscription && (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Info className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="font-bold capitalize">{subscription.status}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                    <ArrowUpRight className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Renova em</p>
                    <p className="font-bold">
                      {subscription.current_period_end
                        ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
                        : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Plans */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Escolha seu Plano</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan
            const isUpgrading = PLANS.findIndex(p => p.id === currentPlan) < PLANS.findIndex(p => p.id === plan.id)

            return (
              <Card key={plan.id} className={cn(
                "relative p-6 flex flex-col",
                isCurrent && "border-primary ring-2 ring-primary/20"
              )}>
                {isCurrent && (
                  <Badge variant="default" className="absolute -top-3 left-3">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Atual
                  </Badge>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-4xl font-bold">
                      {plan.price === 0 ? 'Grátis' : `R$ ${plan.price.toLocaleString('pt-BR')},00`}
                    </span>
                    {plan.price > 0 && <span className="text-muted-foreground">/mês</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{plan.credits.toLocaleString('pt-BR')} créditos/mês</p>
                  <p className="text-xs text-muted-foreground">Modelo: {plan.model}</p>
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" className="w-full" onClick={handlePortal} disabled={portalMutation.isPending}>
                    {portalMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Abrindo Portal...
                      </>
                    ) : (
                      'Gerenciar Assinatura'
                    )}
                  </Button>
                ) : plan.priceId ? (
                  <Button
                    className="w-full"
                    variant={isUpgrading ? 'default' : 'outline'}
                    onClick={() => handleCheckout(plan.priceId)}
                    disabled={checkoutMutation.isPending}
                  >
                    {checkoutMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Redirecionando...
                      </>
                    ) : isUpgrading ? (
                      <>
                        <ArrowUpRight className="h-4 w-4 mr-2" />
                        Assinar Agora
                      </>
                    ) : (
                      'Downgrade'
                    )}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    Plano Atual
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {/* Info */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-2">Importante sobre cobrança</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Créditos são contados em <strong>palavras processadas</strong>: humanizar = N palavras, detectar = N/2 palavras</li>
                <li>Sanitização é <strong>gratuita</strong> e não consome créditos</li>
                <li>Plano gratuito: 5.000 palavras/mês, renova todo dia 1º</li>
                <li>Assinaturas são gerenciadas pelo Stripe (portal seguro)</li>
                <li>Cancelamento: acesso mantido até o fim do período pago</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}