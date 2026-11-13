'use client'

import { useCreditBalance, useDocuments, useHumanizeJobs, useDetectJobs, useSubscription } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  FileText,
  Bot,
  Search,
  CreditCard,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

export function Dashboard() {
  const { data: balance } = useCreditBalance()
  const { data: documents } = useDocuments(5, 0)
  const { data: humanizeJobs } = useHumanizeJobs(5, 0)
  const { data: detectJobs } = useDetectJobs(5, 0)
  const { data: subscription } = useSubscription()

  const stats = [
    { name: 'Créditos', value: balance?.balance ?? 0, icon: CreditCard, color: 'text-blue-600', href: '/billing' },
    { name: 'Documentos', value: documents?.total ?? 0, icon: FileText, color: 'text-green-600', href: '/documents' },
    { name: 'Humanizações', value: humanizeJobs?.length ?? 0, icon: Bot, color: 'text-purple-600', href: '/humanize' },
    { name: 'Detecções', value: detectJobs?.length ?? 0, icon: Search, color: 'text-orange-600', href: '/detect' },
  ]

  const recentJobs = [
    ...(humanizeJobs?.slice(0, 3).map(j => ({ ...j, type: 'humanize' as const })) || []),
    ...(detectJobs?.slice(0, 3).map(j => ({ ...j, type: 'detect' as const })) || []),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
      done: 'success',
      running: 'warning',
      queued: 'default',
      failed: 'destructive',
    }
    const icons: Record<string, React.ReactNode> = {
      done: <CheckCircle className="h-3 w-3" />,
      running: <Clock className="h-3 w-3 animate-spin" />,
      queued: <Clock className="h-3 w-3" />,
      failed: <AlertCircle className="h-3 w-3" />,
    }
    return (
      <Badge variant={variants[status] || 'default'} className="gap-1">
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral da sua conta e atividades recentes</p>
        </div>
        <NavLink to="/documents" className="flex items-center gap-2">
          <Button>
            <FileText className="h-4 w-4 mr-2" />
            Novo Documento
          </Button>
        </NavLink>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <NavLink key={stat.name} to={stat.href} className="block">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
                    <p className="text-3xl font-bold">{stat.value.toLocaleString('pt-BR')}</p>
                  </div>
                  <div className={cn("h-12 w-12 rounded-lg flex items-center justify-center", stat.color)}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </NavLink>
        ))}
      </div>

      {/* Recent Jobs & Subscription */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Jobs */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Atividade Recente
              <NavLink to="/humanize" className="text-sm text-primary hover:underline">Ver todos</NavLink>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma atividade recente</p>
                <p className="text-sm">Comece enviando um documento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                        job.type === 'humanize' ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'
                      )}>
                        {job.type === 'humanize' ? (
                          <Bot className="h-5 w-5" />
                        ) : (
                          <Search className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {job.type === 'humanize' ? 'Humanização' : 'Detecção de IA'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.document_id ? `Documento: ${job.document_id.slice(0, 8)}...` : 'Texto direto'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(job.status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(job.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Assinatura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Plano</span>
                    <Badge variant="default">{subscription.plan}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={subscription.status === 'active' ? 'success' : 'default'}>
                      {subscription.status}
                    </Badge>
                  </div>
                  {subscription.current_period_end && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Renova em</span>
                      <span className="text-sm font-medium">
                        {new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
                <Button className="w-full" variant="outline">
                  Gerenciar Assinatura
                </Button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Nenhuma assinatura ativa. Você está no plano gratuito.
                </p>
                <Button className="w-full">
                  Assinar Agora
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}