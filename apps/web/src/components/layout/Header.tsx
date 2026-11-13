'use client'

import { Menu, Bell, Moon, Sun, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/providers/AuthProvider'

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { user } = useAuth()

  return (
    <header className="sticky top-0 z-40 h-16 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </Button>

          <Button variant="ghost" size="icon" aria-label="Toggle theme">
            <Sun className="h-5 w-5 rotate-90 text-muted-foreground" aria-hidden="true" />
          </Button>

          <div className="relative">
            <Button
              variant="ghost"
              className="gap-2 pr-3"
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="hidden sm:block text-sm font-medium">{user?.name || 'Usuário'}</span>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 rounded-md border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95">
                <div className="px-3 py-2 border-b">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.plan?.toLowerCase()}</p>
                </div>
                <Button variant="ghost" className="w-full justify-start" onClick={() => setShowUserMenu(false)}>
                  Configurações
                </Button>
                <Button variant="ghost" className="w-full justify-start text-destructive" onClick={() => setShowUserMenu(false)}>
                  Sair
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}