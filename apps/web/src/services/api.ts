import api from '../lib/api'
import type {
  User,
  AuthTokens,
  LoginRequest,
  SignupRequest,
  Document,
  DocumentList,
  Job,
  JobCreateResponse,
  HumanizeRequest,
  DetectRequest,
  SanitizeRequest,
  Subscription,
  CreditBalance,
} from '../types/api'

// Auth
export const authService = {
  login: (data: LoginRequest) => api.post<AuthTokens>('/auth/login', data).then(r => r.data),
  signup: (data: SignupRequest) => api.post<AuthTokens>('/auth/signup', data).then(r => r.data),
  refresh: (refresh_token: string) => api.post<AuthTokens>('/auth/refresh', { refresh_token }).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me: () => api.get<User>('/auth/me').then(r => r.data),
}

// Documents
export const documentService = {
  list: (limit = 50, offset = 0) =>
    api.get<DocumentList>('/documents', { params: { limit, offset } }).then(r => r.data),
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<Document>('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  get: (id: string) => api.get<Document>(`/documents/${id}`).then(r => r.data),
  getText: (id: string) => api.get<{ text: string }>(`/documents/${id}/text`).then(r => r.data),
  download: (id: string) => api.get(`/documents/${id}/download`, { responseType: 'blob' }).then(r => r.data),
  delete: (id: string) => api.delete(`/documents/${id}`).then(r => r.data),
}

// Jobs
export const jobService = {
  listHumanize: (limit = 20, offset = 0) =>
    api.get<Job[]>('/humanize', { params: { limit, offset } }).then(r => r.data),
  createHumanize: (data: HumanizeRequest) =>
    api.post<JobCreateResponse>('/humanize', data).then(r => r.data),
  getHumanize: (id: string) => api.get<Job>(`/humanize/${id}`).then(r => r.data),

  listDetect: (limit = 20, offset = 0) =>
    api.get<Job[]>('/detect', { params: { limit, offset } }).then(r => r.data),
  createDetect: (data: DetectRequest) =>
    api.post<JobCreateResponse>('/detect', data).then(r => r.data),
  getDetect: (id: string) => api.get<Job>(`/detect/${id}`).then(r => r.data),

  listSanitize: (limit = 20, offset = 0) =>
    api.get<Job[]>('/sanitize', { params: { limit, offset } }).then(r => r.data),
  createSanitize: (data: SanitizeRequest) =>
    api.post<JobCreateResponse>('/sanitize', data).then(r => r.data),
  getSanitize: (id: string) => api.get<Job>(`/sanitize/${id}`).then(r => r.data),
}

// Billing
export const billingService = {
  getSubscription: () => api.get<Subscription | null>('/billing/subscription').then(r => r.data),
  createCheckout: (price_id: string) => api.post<{ url: string }>('/billing/checkout', { price_id }).then(r => r.data),
  createPortal: () => api.post<{ url: string }>('/billing/portal').then(r => r.data),
}

// Credits
export const creditsService = {
  getBalance: () => api.get<CreditBalance>('/credits/balance').then(r => r.data),
}