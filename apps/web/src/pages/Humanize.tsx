'use client'

import { useState } from 'react'
import { useDocuments, useCreateHumanizeJob, useHumanizeJob, useHumanizeJobs } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/utils'
import {
  Bot,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Download,
  FileText,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { HumanizeResult } from '@/types/api'

// Type guards
function isHumanizeResult(result: unknown): result is HumanizeResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'output_text' in result &&
    'changes' in result
  )
}

type Tone = 'academico' | 'neutro' | 'informal'

export function Humanize() {
  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [tone, setTone] = useState<Tone>('academico')
  const [paid, setPaid] = useState(true)
  const [directText, setDirectText] = useState('')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [showResult, setShowResult] = useState<string | null>(null)

  const { data: documents } = useDocuments(100, 0)
  const createMutation = useCreateHumanizeJob()
  const { data: jobs } = useHumanizeJobs(20, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDocId && !directText.trim()) return

    try {
      let job
      if (selectedDocId) {
        job = await createMutation.mutateAsync({ document_id: selectedDocId, tone, paid })
      } else {
        // Create a temporary document first would be needed
        // For now, require document selection
        alert('Selecione um documento ou implemente upload de texto direto')
        return
      }
      setActiveJobId(job.job_id)
      setShowResult(null)
    } catch (error) {
      console.error('Erro ao criar job:', error)
    }
  }

  // Poll for active job
  const { data: activeJob } = useHumanizeJob(activeJobId || '')

  const tones: { value: Tone; label: string; description: string }[] = [
    { value: 'academico', label: 'Acadêmico', description: 'Formal, técnico, adequado para papers e TCCs' },
    { value: 'neutro', label: 'Neutro', description: 'Equilibrado, claro, serve para geral' },
    { value: 'informal', label: 'Informal', description: 'Mais solto, próximo da fala, para blogs e redes' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="text-primary" />
            Humanizador
          </h1>
          <p className="text-muted-foreground">Reescreva textos gerados por IA para soar natural e pessoal</p>
        </div>
        <NavLink to="/documents">
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Gerenciar Documentos
          </Button>
        </NavLink>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Nova Humanização</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Document Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Documento</label>
                <div className="relative">
                  <select
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="w-full appearance-none bg-background border border-input rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  >
                    <option value="">Selecione um documento...</option>
                    {documents?.items.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.filename} ({doc.word_count} palavras)
                      </option>
                    ))}
                  </select>
                  <FileText className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ou <NavLink to="/documents" className="underline hover:text-primary">envie um novo documento</NavLink>
                </p>
              </div>

              {/* Tone Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Tom de Voz</label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {tones.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTone(t.value)}
                      className={cn(
                        "relative p-4 rounded-lg border-2 text-left transition-all",
                        tone === t.value
                          ? "border-primary bg-primary/5"
                          : "border-input hover:border-primary/50"
                      )}
                    >
                      <input
                        type="radio"
                        name="tone"
                        value={t.value}
                        checked={tone === t.value}
                        onChange={() => setTone(t.value)}
                        className="sr-only"
                      />
                      <div className="font-medium">{t.label}</div>
                      <div className="text-sm text-muted-foreground mt-1">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Modelo</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={paid}
                      onChange={(e) => setPaid(e.target.checked)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Usar modelo pago (Sonnet 5) — melhor qualidade</span>
                  </label>
                  {!paid && (
                    <Badge variant="outline" className="text-xs">
                      Gratuito: Haiku 4.5
                    </Badge>
                  )}
                </div>
              </div>

              {/* Submit */}
              <Button type="submit" disabled={createMutation.isPending || (!selectedDocId && !directText.trim())} className="w-full" size="lg">
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enfileirando...
                  </>
                ) : (
                  <>
                    <Bot className="h-4 w-4 mr-2" />
                    Humanizar Texto
                  </>
                )}
              </Button>
            </form>

            {/* Active Job Polling */}
            {activeJobId && activeJob && (
              <div className="mt-6 p-4 rounded-lg border bg-accent/50">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center",
                    activeJob.status === 'running' && 'animate-spin'
                  )}>
                    {activeJob.status === 'running' ? (
                      <Loader2 className="h-4 w-4" />
                    ) : activeJob.status === 'done' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {activeJob.status === 'running' ? 'Processando...' :
                       activeJob.status === 'done' ? 'Concluído!' : 'Falhou'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Job ID: {activeJobId.slice(0, 8)}...
                    </p>
                  </div>
                </div>
                {activeJob.status === 'done' && (
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => setShowResult(activeJobId)}
                  >
                    Ver Resultado
                  </Button>
                )}
              </div>
            )}

            {/* Result Display */}
            {showResult && activeJob?.result && isHumanizeResult(activeJob.result) && (
              <div className="mt-6">
                {(() => {
                  const result = activeJob.result
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium">Resultado da Humanização</h3>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(result.output_text)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => {
                            const blob = new Blob([result.output_text], { type: 'text/plain' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = 'humanizado.txt'
                            a.click()
                          }}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border bg-background max-h-96 overflow-auto">
                        <pre className="whitespace-pre-wrap font-mono text-sm">{result.output_text}</pre>
                      </div>
                      {result.changes && result.changes.length > 0 && (
                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm text-muted-foreground">Ver alterações ({result.changes.length})</summary>
                          <div className="mt-2 space-y-2 max-h-60 overflow-auto">
                            {result.changes.map((change, i: number) => (
                              <div key={i} className="p-3 rounded border text-sm">
                                <div className="text-red-600 line-through mb-1">{change.original}</div>
                                <div className="text-green-600">{change.rewritten}</div>
                                <div className="text-xs text-muted-foreground mt-1">{change.reason}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Jobs Sidebar */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {jobs?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">Nenhuma humanização ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs?.slice(0, 10).map((job) => (
                  <NavLink key={job.id} to={`/humanize/${job.id}`} className="block">
                    <div className="p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">
                          {job.document_id ? `Doc: ${job.document_id.slice(0, 8)}...` : 'Texto direto'}
                        </span>
                        <Badge variant={
                          (job.status === 'done' ? 'success' :
                          job.status === 'running' ? 'warning' :
                          job.status === 'failed' ? 'destructive' : 'default') as "default" | "success" | "warning" | "destructive"
                        } className="text-xs">
                          {job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>{job.params.tone || 'academico'}</span>
                        <span>•</span>
                        <span>{job.words_processed} palavras</span>
                        <span>•</span>
                        <span>{job.credits_charged} créditos</span>
                      </div>
                    </div>
                  </NavLink>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}