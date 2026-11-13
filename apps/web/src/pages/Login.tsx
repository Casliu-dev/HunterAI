'use client'

import { useState } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { useLogin, useSignup } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { Bot, Mail, Lock, User, Loader2, Eye, EyeOff } from 'lucide-react'

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSignup, setIsSignup] = useState(false)
  const [name, setName] = useState('')

  const loginMutation = useLogin()
  const signupMutation = useSignup()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (isSignup) {
        await signupMutation.mutateAsync({ email, password, name })
      } else {
        await loginMutation.mutateAsync({ email, password })
      }
      navigate('/dashboard')
    } catch (error: any) {
      console.error('Auth error:', error)
    }
  }

  const switchMode = () => {
    setIsSignup(!isSignup)
    setEmail('')
    setPassword('')
    setName('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Bot className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle>{isSignup ? 'Criar Conta' : 'Entrar no HunterAI'}</CardTitle>
          <CardDescription>
            {isSignup
              ? 'Comece a humanizar e detectar textos agora'
              : 'Acesse sua conta para continuar'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="pl-10"
                  required
                  disabled={loginMutation.isPending || signupMutation.isPending}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  required
                  disabled={loginMutation.isPending || signupMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {loginMutation.isError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm text-center">
                {(loginMutation.error as any)?.response?.data?.detail || 'Credenciais inválidas'}
              </div>
            )}

            {signupMutation.isError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm text-center">
                {(signupMutation.error as any)?.response?.data?.detail || 'Erro ao criar conta'}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loginMutation.isPending || signupMutation.isPending}>
              {loginMutation.isPending || signupMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isSignup ? 'Criando...' : 'Entrando...'}
                </>
              ) : isSignup ? (
                'Criar Conta'
              ) : (
                'Entrar'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">
              {isSignup ? 'Já tem conta?' : 'Não tem conta?'}
            </span>
            <Button variant="ghost" className="ml-2" onClick={switchMode}>
              {isSignup ? 'Entrar' : 'Criar conta'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}