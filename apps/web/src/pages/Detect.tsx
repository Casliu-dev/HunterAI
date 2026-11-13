'use client'

import { useState } from 'react'
import { useDocuments, useCreateDetectJob, useDetectJob, useDetectJobs } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import {
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  AlertTriangle,
  Brain,
  BarChart2,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { DetectionResult } from '@/types/api'

// Type guards
function isDetectionResult(result: unknown): result is DetectionResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'ai_probability' in result &&
    'highlights' in result &&
    'sentence_scores' in result
  )
}

export function Detect() {
  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [showResult, setShowResult] = useState<string | null>(null)

  const { data: documents } = useDocuments(100, 0)
  const createMutation = useCreateDetectJob()
  const { data: jobs } = useDetectJobs(20, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDocId) return

    try {
      const job = await createMutation.mutateAsync({ document_id: selectedDocId })
      setActiveJobId(job.job_id)
      setShowResult(null)
    } catch (error) {
      console.error('Erro ao criar job:', error)
    }
  }

  const { data: activeJob } = useDetectJob(activeJobId || '')

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-red-600 bg-red-100'
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-100'
    return 'text-green-600 bg-green-100'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 0.7) return 'Alta probabilidade de IA'
    if (score >= 0.4) return 'Probabilidade moderada'
    return 'Baixa probabilidade de IA'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Search className="text-primary" />
            Detector de IA
          </h1>
          <p className="text-muted-foreground">Estime a probabilidade de um texto ter sido gerado por IA</p>
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
            <CardTitle>Nova Detecção</CardTitle>
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

              {/* Info Box */}
              <div className="p-4 rounded-lg border bg-blue-50">
                <div className="flex items-start gap-3">
                  <Brain className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Como funciona</p>
                    <p>O detector analisa perplexidade e burstiness (variação de estrutura) do texto.
                    Textos de IA tendem a ter baixa perplexidade e baixa variação.</p>
                    <p className="mt-2 font-medium">
                      <AlertTriangle className="h-4 w-4 inline mr-1" />
                      <strong>Importante:</strong> Este detector indica probabilidade, não certeza.
                      Use como apoio, não como veredito final. Falsos positivos ocorrem.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <Button type="submit" disabled={createMutation.isPending || !selectedDocId} className="w-full" size="lg">
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Detectar IA
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
                      {activeJob.status === 'running' ? 'Analisando texto...' :
                       activeJob.status === 'done' ? 'Análise concluída!' : 'Falhou'}
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
                    Ver Relatório
                  </Button>
                )}
              </div>
            )}

            {/* Result Display */}
            {showResult && activeJob?.result && isDetectionResult(activeJob.result) && (
              <div className="mt-6 space-y-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <BarChart2 className="h-5 w-5" />
                  Relatório de Detecção
                </h3>

                {/* Score Card */}
                <Card className={cn("border-2", activeJob.ai_score && activeJob.ai_score > 0.7 ? 'border-red-500' : '')}>
                  <CardContent className="p-6">
                    <div className="grid gap-4 md:grid-cols-3 items-center">
                      <div className="text-center">
                        <div className="text-4xl font-bold" style={{ color: getScoreColor(activeJob.ai_score || 0).split(' ')[0] }}>
                          {(activeJob.ai_score ? activeJob.ai_score * 100 : 0).toFixed(0)}%
                        </div>
                        <p className="text-sm text-muted-foreground">Probabilidade de IA</p>
                      </div>
                      <div className="text-center border-x border-y-0 md:border-l">
                        <Progress
                          value={activeJob.ai_score ? activeJob.ai_score * 100 : 0}
                          className="h-4"
                        />
                        <p className="text-sm text-muted-foreground mt-1">Score</p>
                      </div>
                      <div className="text-center">
                        <Badge
                          variant={activeJob.ai_score && activeJob.ai_score > 0.7 ? 'destructive' :
                                activeJob.ai_score && activeJob.ai_score > 0.4 ? 'warning' : 'success'}
                          className="text-lg px-3 py-1"
                        >
                          {getScoreLabel(activeJob.ai_score || 0)}
                        </Badge>
                        {activeJob.confidence !== null && activeJob.confidence !== undefined && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Confiança: {(activeJob.confidence * 100).toFixed(0)}%
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Highlights */}
                {activeJob.result.highlights && activeJob.result.highlights.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                        Trechos Suspeitos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-96 overflow-auto">
                        {activeJob.result.highlights.map((h: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg border bg-yellow-50">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                Score: {(h.score * 100).toFixed(0)}%
                              </Badge>
                              <span className="text-xs text-muted-foreground">{h.reason}</span>
                            </div>
                            <p className="text-sm font-mono bg-background p-2 rounded">
                              {h.text || 'Trecho destacado'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Sentence Scores */}
                {activeJob.result.sentence_scores && activeJob.result.sentence_scores.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart2 className="h-5 w-5" />
                        Análise por Sentença
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-96 overflow-auto">
                        {activeJob.result.sentence_scores.map((s: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-16 h-2 rounded bg-muted", getScoreColor(s.score))}>
                                <div
                                  className="h-full rounded"
                                  style={{
                                    width: `${(s.score * 100).toFixed(0)}%`,
                                    backgroundColor: getScoreColor(s.score).split(' ')[0]
                                  }}
                                />
                              </div>
                              <span className="text-xs font-mono w-10 text-right">
                                {(s.score * 100).toFixed(0)}%
                              </span>
                              <p className="text-sm flex-1 truncate">{s.text.slice(0, 150)}...</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Jobs Sidebar */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {jobs?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">Nenhuma detecção ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs?.slice(0, 10).map((job) => (
                  <NavLink key={job.id} to={`/detect/${job.id}`} className="block">
                    <div className="p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">
                          {job.document_id ? `Doc: ${job.document_id.slice(0, 8)}...` : 'Texto direto'}
                        </span>
                        <Badge variant={
                          job.status === 'done' ? 'success' :
                          job.status === 'running' ? 'warning' :
                          job.status === 'failed' ? 'destructive' : 'default'
                        } className="text-xs">
                          {job.status}
                        </Badge>
                      </div>
                      {job.ai_score !== null && job.ai_score !== undefined && (
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={job.ai_score * 100} className="flex-1 h-1.5" />
                          <span className={cn("text-xs font-medium", getScoreColor(job.ai_score))}>
                            {(job.ai_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
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