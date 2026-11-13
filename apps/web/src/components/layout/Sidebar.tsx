'use client'

import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FileText,
  Bot,
  Search,
  CreditCard,
  Settings,
  LogOut,
  User,
} from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/components/ui/Button'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Documentos', href: '/documents', icon: FileText },
  { name: 'Humanizar', href: '/humanize', icon: Bot },
  { name: 'Detectar IA', href: '/detect', icon: Search },
  { name: 'Sanitizar', href: '/sanitize', icon: FileText },
  { name: 'Assinatura', href: '/billing', icon: CreditCard },
  { name: 'Configurações', href: '/settings', icon: Settings },
]

export function Sidebar({ className }: { className?: string }) {
  const location = useLocation()
  const { user, logout } = useAuth()

  return (
    <aside className={cn("fixed inset-y-0 left-0 z-50 w-64 bg-background border-r transition-transform duration-200", className)}>
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b px-4">
          <NavLink to="/dashboard" className="flex items-center gap-2 font-bold text-xl">
            <Bot className="h-8 w-8 text-primary" />
            <span>HunterAI</span>
          </NavLink>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4" aria-label="Main navigation">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href ||
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {item.name}
              </NavLink>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <User className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.plan?.toLowerCase()}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-3"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </Button>
        </div>
      </div>
    </aside>
  )
}