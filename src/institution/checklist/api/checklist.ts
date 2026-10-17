import { portalApi } from '@/shared/lib/portalApi'
import type { DealDocument, DocRequirement } from '../types'

const base = (pid: string) => `/pipelines/${pid}/documents`

export const fetchDealDocuments = (pid: string) => portalApi.get<DealDocument[]>(base(pid))

export async function uploadDealDocument(pid: string, docId: string, file: File) {
  const { upload_url, storage_path } = await portalApi.post<{ upload_url: string; storage_path: string }>(
    `${base(pid)}/${docId}/upload-url`,
    { file_name: file.name, mime_type: file.type, file_size: file.size },
  )
  const put = await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
  if (!put.ok) throw new Error('The upload failed. Check your connection and try again.')
  return portalApi.post<DealDocument>(`${base(pid)}/${docId}/receive`, {
    storage_path, file_name: file.name, mime_type: file.type, file_size: file.size,
  })
}

export const reviewDealDocument = (
  pid: string, docId: string, action: 'verify' | 'reject' | 'waive', note?: string,
) => portalApi.post<DealDocument>(`${base(pid)}/${docId}/${action}`, { note })

export const dealDocumentFileUrl = (pid: string, docId: string) =>
  portalApi.get<{ url: string; file_name: string }>(`${base(pid)}/${docId}/file`)

const reqBase = (tid: string) => `/pipelines/templates/${tid}/documents`
export const fetchRequirements = (tid: string) => portalApi.get<DocRequirement[]>(reqBase(tid))
export const createRequirement = (tid: string, body: Partial<DocRequirement>) =>
  portalApi.post<DocRequirement>(reqBase(tid), body)
export const updateRequirement = (tid: string, id: string, body: Partial<DocRequirement>) =>
  portalApi.put<DocRequirement>(`${reqBase(tid)}/${id}`, body)
export const removeRequirement = (tid: string, id: string) =>
  portalApi.delete<void>(`${reqBase(tid)}/${id}`)
