'use client'

import { useState } from 'react'
import { useDocuments, useUploadDocument, useDeleteDocument } from '@/hooks/useApi'
import { documentService } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Eye,
  Search,
  Loader2,
  X,
} from 'lucide-react'
import { format } from 'date-fns'

export function Documents() {
  const [page, setPage] = useState(1)
  const limit = 10
  const [search, setSearch] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState('')

  const { data: documents, isLoading, isError } = useDocuments(limit, (page - 1) * limit)
  const uploadMutation = useUploadDocument()
  const deleteMutation = useDeleteDocument()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) return

    await uploadMutation.mutateAsync(selectedFile)
    setSelectedFile(null)
    const input = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement
    if (input) input.value = ''
  }

  const handlePreview = async (id: string) => {
    if (previewId === id) {
      setPreviewId(null)
      setPreviewText('')
      return
    }
    setPreviewId(id)
    const result = await documentService.getText(id)
    if (result?.text) {
      setPreviewText(result.text.slice(0, 2000) + (result.text.length > 2000 ? '...' : ''))
    }
  }

  const handleDownload = async (id: string, filename: string, mimeType: string) => {
    const response = await fetch(`/api/v1/documents/${id}/download`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
      },
    })
    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este documento?')) {
      await deleteMutation.mutateAsync(id)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documentos</h1>
          <p className="text-muted-foreground">Gerencie seus arquivos enviados</p>
        </div>
        <Button onClick={() => document.getElementById('file-input')?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Enviar Documento
        </Button>
      </div>

      {/* Upload Form (Hidden) */}
      <form onSubmit={handleUpload} className="hidden" id="upload-form">
        <input
          id="file-input"
          type="file"
          accept=".txt,.docx,.pdf"
          onChange={handleFileChange}
          required
        />
        <Button type="submit" disabled={!selectedFile || uploadMutation.isPending}>
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Confirmar Envio
            </>
          )}
        </Button>
        <Button type="button" variant="ghost" className="ml-2" onClick={() => setSelectedFile(null)}>
          Cancelar
        </Button>
      </form>

      {selectedFile && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-yellow-600" />
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Desconhecido'}
                  </p>
                </div>
              </div>
              <Button type="submit" form="upload-form" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Lista de Documentos</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar documentos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <div className="text-center py-12 text-red-600">
              Erro ao carregar documentos
            </div>
          ) : documents?.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum documento encontrado</p>
              <p className="text-sm">Envie seu primeiro documento para começar</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="hidden md:grid grid-cols-[1fr_100px_120px_140px_100px] gap-4 px-3 py-2 text-sm font-medium text-muted-foreground border-b">
                <span>Nome</span>
                <span>Tipo</span>
                <span>Tamanho</span>
                <span>Data</span>
                <span>Ações</span>
              </div>
              {documents?.items.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 p-3 border-b hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="h-6 w-6 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.word_count.toLocaleString('pt-BR')} palavras • {doc.mime_type}
                      </p>
                    </div>
                  </div>
                  <div className="hidden md:block w-24 text-sm text-muted-foreground">
                    {doc.mime_type.split('/')[1]?.toUpperCase()}
                  </div>
                  <div className="hidden md:block w-28 text-sm text-muted-foreground">
                    {(doc.size_bytes / 1024).toFixed(1)} KB
                  </div>
                  <div className="hidden md:block w-36 text-sm text-muted-foreground">
                    {format(new Date(doc.created_at), 'dd/MM/yyyy HH:mm')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePreview(doc.id)}
                      aria-label={previewId === doc.id ? 'Fechar prévia' : 'Ver prévia'}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(doc.id, doc.filename, doc.mime_type)}
                      aria-label="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(doc.id)}
                      aria-label="Excluir"
                      className="text-red-600 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {documents && documents.total > limit && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Mostrando {(page - 1) * limit + 1} a {Math.min(page * limit, documents.total)} de {documents.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(p + 1, Math.ceil(documents.total / limit)))}
                  disabled={page * limit >= documents.total}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}

          {/* Preview Modal */}
          {previewId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <Card className="w-full max-w-3xl max-h-[80vh] flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between border-b p-4">
                  <CardTitle>Prévia do Documento</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setPreviewId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto p-4">
                  <pre className="whitespace-pre-wrap text-sm font-mono">{previewText}</pre>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}