import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authService, documentService, jobService, billingService, creditsService } from '../services/api'
import type { LoginRequest, SignupRequest, HumanizeRequest, DetectRequest, SanitizeRequest, Job, DocumentList } from '../types/api'

// Auth hooks
export function useLogin() {
  return useMutation({
    mutationFn: (data: LoginRequest) => authService.login(data),
    onSuccess: (data) => {
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
    },
  })
}

export function useSignup() {
  return useMutation({
    mutationFn: (data: SignupRequest) => authService.signup(data),
    onSuccess: (data) => {
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      queryClient.clear()
    },
  })
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => authService.me(),
    retry: false,
  })
}

// Document hooks
export function useDocuments(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['documents', limit, offset],
    queryFn: () => documentService.list(limit, offset),
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => documentService.upload(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: () => documentService.get(id),
    enabled: !!id,
  })
}

export function useDocumentText(id: string) {
  return useQuery({
    queryKey: ['document', id, 'text'],
    queryFn: () => documentService.getText(id),
    enabled: !!id,
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => documentService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

// Humanize hooks
export function useHumanizeJobs(limit = 20, offset = 0) {
  return useQuery<Job[]>({
    queryKey: ['jobs', 'humanize', limit, offset],
    queryFn: () => jobService.listHumanize(limit, offset),
  })
}

export function useCreateHumanizeJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: HumanizeRequest) => jobService.createHumanize(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', 'humanize'] })
    },
  })
}

export function useHumanizeJob(id: string) {
  return useQuery({
    queryKey: ['job', 'humanize', id],
    queryFn: () => jobService.getHumanize(id),
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  })
}

// Detect hooks
export function useDetectJobs(limit = 20, offset = 0) {
  return useQuery<Job[]>({
    queryKey: ['jobs', 'detect', limit, offset],
    queryFn: () => jobService.listDetect(limit, offset),
  })
}

export function useCreateDetectJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: DetectRequest) => jobService.createDetect(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', 'detect'] })
    },
  })
}

export function useDetectJob(id: string) {
  return useQuery({
    queryKey: ['job', 'detect', id],
    queryFn: () => jobService.getDetect(id),
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  })
}

// Sanitize hooks
export function useSanitizeJobs(limit = 20, offset = 0) {
  return useQuery<Job[]>({
    queryKey: ['jobs', 'sanitize', limit, offset],
    queryFn: () => jobService.listSanitize(limit, offset),
  })
}

export function useCreateSanitizeJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SanitizeRequest) => jobService.createSanitize(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', 'sanitize'] })
    },
  })
}

export function useSanitizeJob(id: string) {
  return useQuery({
    queryKey: ['job', 'sanitize', id],
    queryFn: () => jobService.getSanitize(id),
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  })
}

// Billing hooks
export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: () => billingService.getSubscription(),
  })
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (price_id: string) => billingService.createCheckout(price_id),
  })
}

export function useCreatePortal() {
  return useMutation({
    mutationFn: () => billingService.createPortal(),
  })
}

// Credits hooks
export function useCreditBalance() {
  return useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: () => creditsService.getBalance(),
  })
}