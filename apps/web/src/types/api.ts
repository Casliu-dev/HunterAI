export interface User {
  id: string
  email: string
  name: string | null
  plan: 'FREE' | 'PRO' | 'TEAM'
  is_active: boolean
  is_verified: boolean
  stripe_customer_id: string | null
  created_at: string
  updated_at: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface SignupRequest {
  email: string
  password: string
  name?: string
}

export interface Document {
  id: string
  user_id: string
  filename: string
  mime_type: string
  size_bytes: number
  storage_path: string
  extracted_text: string
  word_count: number
  created_at: string
  updated_at: string
}

export interface DocumentList {
  items: Document[]
  total: number
  limit: number
  offset: number
}

export interface JobKind {
  HUMANIZE: 'humanize'
  DETECT: 'detect'
  SANITIZE: 'sanitize'
}

export interface JobStatus {
  QUEUED: 'queued'
  RUNNING: 'running'
  DONE: 'done'
  FAILED: 'failed'
}

export interface Job {
  id: string
  user_id: string
  document_id: string | null
  kind: 'humanize' | 'detect' | 'sanitize'
  status: 'queued' | 'running' | 'done' | 'failed'
  input_text: string
  params: Record<string, unknown> & { tone?: 'academico' | 'neutro' | 'informal' }
  result: HumanizeResult | DetectionResult | SanitizeResult | Record<string, unknown> | null
  error: string | null
  ai_score: number | null
  confidence: number | null
  words_processed: number
  credits_charged: number
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface JobCreateResponse {
  job_id: string
  status: 'queued' | 'running' | 'done' | 'failed'
  message: string
}

export interface HumanizeRequest {
  document_id: string
  tone: 'academico' | 'neutro' | 'informal'
  paid: boolean
}

export interface DetectRequest {
  document_id: string
}

export interface SanitizeRequest {
  document_id: string
}

export interface Subscription {
  plan: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export interface DetectionResult {
  ai_probability: number
  confidence: number
  highlights: Array<{
    start: number
    end: number
    score: number
    reason: string
  }>
  sentence_scores: Array<{
    text: string
    score: number
    start: number
    end: number
  }>
}

export interface HumanizeResult {
  output_text: string
  changes: Array<{
    original: string
    rewritten: string
    reason: string
  }>
}

export interface SanitizeResult {
  text: string
  report: {
    invisible_chars_removed: number
    typography_normalized: number
    metadata_removed: string[]
  }
}

export interface CreditBalance {
  balance: number
  plan: string
}