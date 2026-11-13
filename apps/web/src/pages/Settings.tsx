'use client'

import { useState } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { useMe } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import {
  User,
  Mail,
  Lock,
  Bell,
  Shield,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'

export function Settings() {
  const { user, logout } = useAuth()
  const { data: meData, refetch } = useMe()
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'danger'>('profile')

  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const tabs = [
    { id: 'profile', label: 'Perfil', icon: User },
    { id: 'security', label: 'Segurança', icon: Shield },
    { id: 'notifications', label: 'Notificações', icon: Bell },
    { id: 'danger', label: 'Zona de Perigo', icon: AlertCircle },
  ]

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    // Simulate API call
    await new Promise(r => setTimeout(r, 1000))

    setSaving(false)
    setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' })
    refetch()
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas não coincidem' })
      return
    }
    if (passwordData.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'A nova senha deve ter pelo menos 8 caracteres' })
      return
    }

    setSaving(true)
    setMessage(null)

    // Simulate API call
    await new Promise(r => setTimeout(r, 1000))

    setSaving(false)
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setMessage({ type: 'success', text: 'Senha alterada com sucesso!' })
  }

  const handleDeleteAccount = () => {
    if (confirm('TEM CERTEZA? Esta ação é irreversível e apagará todos os seus dados.')) {
      if (confirm('Última confirmação: digite "DELETAR" para confirmar')) {
        // Would call delete API
        alert('Conta deletada (simulado)')
        logout()
      }
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferências</p>
      </div>

      {/* User Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{user?.name || 'Usuário'}</h2>
              <p className="text-muted-foreground">{user?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="default">{user?.plan}</Badge>
                <Badge variant="outline">{user?.is_verified ? 'Verificado' : 'Não verificado'}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-4 border-b mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {message && (
        <div className={cn(
          "p-4 rounded-lg mb-4 flex items-center gap-3 animate-in slide-in-from-top-2",
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        )}>
          {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle>Informações do Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <Input
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-mail</label>
                <Input
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground mt-1">O e-mail não pode ser alterado. Para mudar, entre em contato com o suporte.</p>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar Alterações
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <Card>
          <CardHeader>
            <CardTitle>Alterar Senha</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Senha Atual</label>
                <Input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nova Senha</label>
                <Input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirmar Nova Senha</label>
                <Input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                Alterar Senha
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <Card>
          <CardHeader>
            <CardTitle>Preferências de Notificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">E-mail: Job concluído</p>
                <p className="text-sm text-muted-foreground">Receba e-mail quando um job terminar</p>
              </div>
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-input text-primary focus:ring-primary" />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">E-mail: Job falhou</p>
                <p className="text-sm text-muted-foreground">Seja notificado se houver erro no processamento</p>
              </div>
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-input text-primary focus:ring-primary" />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">E-mail: Fatura e cobrança</p>
                <p className="text-sm text-muted-foreground">Receba recibos e avisos de renovação</p>
              </div>
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-input text-primary focus:ring-primary" />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">Push: Job concluído (navegador)</p>
                <p className="text-sm text-muted-foreground">Notificação no navegador quando job terminar</p>
              </div>
              <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone Tab */}
      {activeTab === 'danger' && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Zona de Perigo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 rounded-lg border bg-red-50">
              <h3 className="font-medium text-red-800 mb-2">Excluir Conta</h3>
              <p className="text-sm text-red-700 mb-4">
                Esta ação é <strong>irreversível</strong>. Todos os seus documentos, jobs,
                histórico de créditos e dados de assinatura serão permanentemente apagados.
              </p>
              <Button variant="destructive" onClick={handleDeleteAccount}>
                <AlertCircle className="h-4 w-4 mr-2" />
                Excluir Minha Conta
              </Button>
            </div>

            <div className="p-4 rounded-lg border">
              <h3 className="font-medium mb-2">Revogar Sessões</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Invalida todos os tokens de acesso e refresh. Você será desconectado de todos os dispositivos.
              </p>
              <Button variant="outline" onClick={() => alert('Sessões revogadas (simulado)')}>
                Revogar Todas as Sessões
              </Button>
            </div>

            <div className="p-4 rounded-lg border">
              <h3 className="font-medium mb-2">Exportar Dados (LGPD)</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Baixe uma cópia de todos os seus dados pessoais em formato JSON.
              </p>
              <Button variant="outline" onClick={() => alert('Exportação iniciada (simulado)')}>
                Solicitar Exportação
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}