'use client'

import { useState } from 'react'
import { useDocuments, useCreateSanitizeJob, useSanitizeJob, useSanitizeJobs } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  Shield,
  Eye,
  Copy,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { SanitizeResult } from '@/types/api'

// Type guards
function isSanitizeResult(result: unknown): result is SanitizeResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'text' in result &&
    'report' in result
  )
}

export function Sanitize() {
  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [showResult, setShowResult] = useState<string | null>(null)

  const { data: documents } = useDocuments(100, 0)
  const createMutation = useCreateSanitizeJob()
  const { data: jobs } = useSanitizeJobs(20, 0)

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

  const { data: activeJob } = useSanitizeJob(activeJobId || '')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="text-primary" />
            Sanitização
          </h1>
          <p className="text-muted-foreground">Remova metadados, caracteres invisíveis e vestígios de edição dos seus arquivos</p>
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
            <CardTitle>Nova Sanitização</CardTitle>
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
                        {doc.filename} ({doc.mime_type.split('/')[1]?.toUpperCase()})
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
              <div className="p-4 rounded-lg border bg-green-50">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-green-800">
                    <p className="font-medium mb-1">O que é removido</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Caracteres invisíveis (zero-width, BOM, etc.)</li>
                      <li>Tipografia especial (aspas curvas, travessões, reticências)</li>
                      <li>Metadados do arquivo (autor, datas, revisões, comentários)</li>
                      <li>Propriedades do documento (core.xml, app.xml no DOCX)</li>
                      <li>Informações do PDF (/Info, XMP)</li>
                    </ul>
                    <p className="mt-2 font-medium">
                      <strong>Grátis:</strong> A sanitização não consome créditos.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <Button type="submit" disabled={createMutation.isPending || !selectedDocId} className="w-full" size="lg">
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sanitizando...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Sanitizar Arquivo
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
                      {activeJob.status === 'running' ? 'Sanitizando arquivo...' :
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
                    Ver Relatório
                  </Button>
                )}
              </div>
            )}

            {/* Result Display */}
            {showResult && activeJob?.result && isSanitizeResult(activeJob.result) && (
              <div className="mt-6 space-y-4">
                {(() => {
                  const result = activeJob.result
                  return (
                    <>
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Relatório de Sanitização
                      </h3>

                      <Card>
                        <CardContent className="p-6">
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="text-center p-4 rounded-lg bg-green-50">
                              <div className="text-3xl font-bold text-green-600">
                                {result.report.invisible_chars_removed || 0}
                              </div>
                              <p className="text-sm text-muted-foreground">Invisíveis Removidos</p>
                            </div>
                            <div className="text-center p-4 rounded-lg bg-blue-50">
                              <div className="text-3xl font-bold text-blue-600">
                                {result.report.typography_normalized || 0}
                              </div>
                              <p className="text-sm text-muted-foreground">Tipografia Normalizada</p>
                            </div>
                            <div className="text-center p-4 rounded-lg bg-purple-50">
                              <div className="text-3xl font-bold text-purple-600">
                                {result.report.metadata_removed?.length || 0}
                              </div>
                              <p className="text-sm text-muted-foreground">Metadados Removidos</p>
                            </div>
                          </div>

                          {result.report.metadata_removed && result.report.metadata_removed.length > 0 && (
                            <div className="mt-4">
                              <h4 className="font-medium mb-2">Metadados removidos:</h4>
                              <div className="flex flex-wrap gap-2">
                                {result.report.metadata_removed.map((m: string, i: number) => (
                                  <Badge key={i} variant="outline">{m}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 flex gap-2">
                            <Button variant="outline" onClick={() => {
                              const blob = new Blob([result.text], { type: 'text/plain' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = 'sanitizado.txt'
                              a.click()
                            }}>
                              <Download className="h-4 w-4 mr-2" />
                              Baixar Texto
                            </Button>
                            <Button variant="ghost" onClick={() => navigator.clipboard.writeText(result.text)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copiar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {result.text && (
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Texto Sanitizado (Prévia)</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="p-4 rounded-lg border bg-background max-h-96 overflow-auto">
                              <pre className="whitespace-pre-wrap font-mono text-sm">{result.text.slice(0, 5000)}...</pre>
                            </div>
                          </CardContent>
                        </Card>
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
              <Shield className="h-5 w-5" />
              Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {jobs?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">Nenhuma sanitização ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs?.slice(0, 10).map((job) => (
                  <NavLink key={job.id} to={`/sanitize/${job.id}`} className="block">
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
                      {job.result && isSanitizeResult(job.result) && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{job.result.report.invisible_chars_removed || 0} invisíveis</span>
                          <span>•</span>
                          <span>{job.result.report.typography_normalized || 0} tipografia</span>
                          <span>•</span>
                          <span>{job.result.report.metadata_removed?.length || 0} metadados</span>
                        </div>
                      )}
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