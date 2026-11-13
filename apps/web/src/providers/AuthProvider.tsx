'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useMe, useLogout } from '../hooks/useApi'
import type { User } from '../types/api'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (tokens: { access_token: string; refresh_token: string }) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const { data: user, isLoading, refetch } = useMe()
  const logoutMutation = useLogout()

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      refetch()
    } else {
      setHydrated(true)
    }
  }, [refetch])

  useEffect(() => {
    if (!isLoading) {
      setHydrated(true)
    }
  }, [isLoading])

  const login = (tokens: { access_token: string; refresh_token: string }) => {
    localStorage.setItem('access_token', tokens.access_token)
    localStorage.setItem('refresh_token', tokens.refresh_token)
    refetch()
  }

  const logout = () => {
    logoutMutation.mutate()
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{
      user: user ?? null,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}