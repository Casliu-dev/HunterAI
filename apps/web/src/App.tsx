import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Providers } from './providers/QueryProvider'
import { AuthProvider, useAuth } from './providers/AuthProvider'
import { Dashboard } from './pages/Dashboard'
import { Documents } from './pages/Documents'
import { Humanize } from './pages/Humanize'
import { Detect } from './pages/Detect'
import { Sanitize } from './pages/Sanitize'
import { Billing } from './pages/Billing'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { DashboardLayout } from './components/layout/DashboardLayout'
import './index.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />

      <Route element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/humanize" element={<Humanize />} />
        <Route path="/detect" element={<Detect />} />
        <Route path="/sanitize" element={<Sanitize />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Providers>
    </BrowserRouter>
  )
}

export default App