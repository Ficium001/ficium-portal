// =============================================================
// Ficium Portal — inst:doctemplates hooks
// Backend: ficium-portal-api /institution/doc-templates/*
// =============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi } from '@/shared/lib/portalApi'
import type {
  DocTemplate, DocTemplateVersion, DocGeneration, MergeField, DocCategory,
} from '../types/docTemplates'

const BASE = '/institution/doc-templates'

export const DTQK = {
  templates:   ['doc-templates', 'list'] as const,
  versions:    (tid: string) => ['doc-templates', 'versions', tid] as const,
  mergeFields: ['doc-templates', 'merge-fields'] as const,
} as const

// ─── Templates ────────────────────────────────────────────────

export function useDocTemplates() {
  return useQuery<DocTemplate[]>({
    queryKey: DTQK.templates,
    queryFn: () => portalApi.get<DocTemplate[]>(BASE),
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      code: string; name: string; description?: string | null
      doc_category: DocCategory; product_code?: string | null
    }) => portalApi.post<DocTemplate>(BASE, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: DTQK.templates }),
  })
}

export function useRetireTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) =>
      portalApi.post<DocTemplate>(`${BASE}/${templateId}/retire`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: DTQK.templates }),
  })
}

// ─── Versions (maker-checker) ─────────────────────────────────

export function useTemplateVersions(templateId: string | null) {
  return useQuery<DocTemplateVersion[]>({
    queryKey: DTQK.versions(templateId ?? 'none'),
    queryFn: () => portalApi.get<DocTemplateVersion[]>(`${BASE}/${templateId}/versions`),
    enabled: !!templateId,
  })
}

export function useUploadVersion(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, changeNote }: { file: File; changeNote?: string }) => {
      const form = new FormData()
      form.append('file', file)
      if (changeNote) form.append('change_note', changeNote)
      return portalApi.postForm<DocTemplateVersion>(`${BASE}/${templateId}/versions`, form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DTQK.versions(templateId) })
      qc.invalidateQueries({ queryKey: DTQK.templates })
    },
  })
}

export function useDecideVersion(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ versionId, action, note }: {
      versionId: string; action: 'approve' | 'reject'; note?: string
    }) => portalApi.post<DocTemplateVersion>(
      `${BASE}/${templateId}/versions/${versionId}/decide`,
      { action, note: note ?? null },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DTQK.versions(templateId) })
      qc.invalidateQueries({ queryKey: DTQK.templates })
    },
  })
}

// ─── Merge fields reference ───────────────────────────────────

export function useMergeFields() {
  return useQuery<MergeField[]>({
    queryKey: DTQK.mergeFields,
    queryFn: () => portalApi.get<MergeField[]>(`${BASE}/merge-fields`),
    staleTime: 60 * 60 * 1000, // canonical list — rarely changes
  })
}

// ─── Generation ───────────────────────────────────────────────

export function useGenerateDocument(templateId: string) {
  return useMutation({
    mutationFn: (body: {
      entity_type?: string; entity_id: string
      data_overrides?: Record<string, unknown>; output_pdf?: boolean
    }) => portalApi.post<DocGeneration>(`${BASE}/${templateId}/generate`, {
      entity_type: body.entity_type ?? 'loan_pipeline',
      entity_id: body.entity_id,
      data_overrides: body.data_overrides ?? {},
      output_pdf: body.output_pdf ?? true,
    }),
  })
}

/** Download a generated document and trigger a browser save. */
export async function downloadGeneration(generationId: string, fmt: 'pdf' | 'docx', fileName: string) {
  const blob = await portalApi.getBlob(`${BASE}/generations/${generationId}/download?fmt=${fmt}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
