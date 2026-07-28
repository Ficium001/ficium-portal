/**
 * @page InstitutionDocuments
 * @route /documents
 * @module inst:documents
 * @description
 *   Institution compliance document management. Required docs checklist
 *   with file upload per row. Compliance gate surfaced via banner.
 *
 * @owner Ficium Engineering
 */

import { useRef, useState } from 'react'
import {
  Upload, CheckCircle2, XCircle, Clock,
  AlertCircle, ExternalLink, ShieldCheck, ShieldAlert,
} from 'lucide-react'
import {
  useDocuments, useDocTypes, useCompliance, useRegisterDocument,
} from '@/institution/hooks/useInstitution'
import type { DocType, InstitutionDoc } from '@/institution/types/institution'
import {
  SectionHeader, InlineAlert, Btn, SkeletonRow,
} from '@/institution/components/primitives'
import { portalApi } from '@/shared/lib/portalApi'

// ─── Status config ─────────────────────────────────────────────
const STATUS_CONFIG = {
  approved:     { label: 'Approved',       Icon: CheckCircle2, cls: 'text-emerald-600' },
  pending:      { label: 'Pending review', Icon: Clock,        cls: 'text-amber-500'   },
  rejected:     { label: 'Rejected',       Icon: XCircle,      cls: 'text-red-500'     },
  expired:      { label: 'Expired',        Icon: AlertCircle,  cls: 'text-red-500'     },
  not_uploaded: { label: 'Not uploaded',   Icon: AlertCircle,  cls: 'text-ink/30'      },
} as const

// ─── ComplianceBanner ─────────────────────────────────────────
function ComplianceBanner() {
  const { data, isLoading } = useCompliance()

  if (isLoading) return <SkeletonRow cols={1} />
  if (!data)     return null

  if (data.can_bid) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <ShieldCheck size={20} className="text-emerald-600 shrink-0" />
        <div>
          <p className="text-[13px] font-bold text-emerald-800">Compliance verified</p>
          <p className="text-[12px] text-emerald-700">
            All required documents approved. Your institution can submit bids.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-[13px] font-bold text-amber-800">Compliance incomplete</p>
        <p className="text-[12px] text-amber-700 mt-0.5">
          {data.missing_docs.length > 0
            ? `Missing: ${data.missing_docs.join(', ')}.`
            : 'Some documents are pending review or require re-upload.'
          }{' '}
          Bid submission is disabled until all mandatory documents are approved.
        </p>
      </div>
    </div>
  )
}

// ─── DocRow ───────────────────────────────────────────────────
function DocRow({
  docType,
  doc,
  onUpload,
  uploading,
}: {
  docType:   DocType
  doc:       InstitutionDoc | undefined
  onUpload:  (docTypeId: string, file: File) => Promise<void>
  uploading: string | null
}) {
  const fileRef    = useRef<HTMLInputElement>(null)
  const isUploading = uploading === docType.id
  const status      = (doc?.status ?? 'not_uploaded') as keyof typeof STATUS_CONFIG
  const { label, Icon, cls } = STATUS_CONFIG[status]

  return (
    <div className="flex items-start gap-4 px-5 py-4 border-b border-ink/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-ink">{docType.label}</span>
          {docType.is_mandatory && (
            <span className="text-[10px] font-bold text-red-500">REQUIRED</span>
          )}
        </div>
        {docType.description && (
          <p className="text-[11px] text-muted mt-0.5">{docType.description}</p>
        )}
        {doc && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5">
              <Icon size={13} className={cls} />
              <span className="text-[11px] text-muted">{label}</span>
              {doc.uploaded_at && (
                <span className="text-[11px] text-muted">
                  · Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                </span>
              )}
            </div>
            {doc.rejection_reason && (
              <p className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                {doc.rejection_reason}
              </p>
            )}
            {doc.expiry_date && (
              <p className="text-[11px] text-amber-600">
                Expires {new Date(doc.expiry_date).toLocaleDateString()}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted truncate max-w-[200px]">{doc.file_name}</span>
              <a
                href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/institution-docs/${doc.storage_path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ficium hover:text-ficium/80"
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        )}
        {!doc && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <Icon size={13} className={cls} />
            <span className="text-[11px] text-muted">{label}</span>
          </div>
        )}
      </div>

      <div className="shrink-0">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={async e => {
            const file = e.target.files?.[0]
            if (file) await onUpload(docType.id, file)
            e.target.value = ''
          }}
        />
        <Btn
          variant={doc?.status === 'approved' ? 'ghost' : 'secondary'}
          loading={isUploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={13} />
          {doc ? 'Re-upload' : 'Upload'}
        </Btn>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function InstitutionDocuments() {
  const { data: docTypes = [], isLoading: typesLoading } = useDocTypes()
  const { data: docs = [],     isLoading: docsLoading  } = useDocuments()
  const registerDoc = useRegisterDocument()

  const [uploading,    setUploading]    = useState<string | null>(null)
  const [uploadError,  setUploadError]  = useState<string | null>(null)

  const isLoading = typesLoading || docsLoading
  const docMap    = Object.fromEntries(docs.map(d => [d.doc_type_id, d]))
  const mandatory = docTypes.filter(dt => dt.is_mandatory)
  const optional  = docTypes.filter(dt => !dt.is_mandatory)

  const handleUpload = async (docTypeId: string, file: File) => {
    setUploadError(null)
    setUploading(docTypeId)
    try {
      const { upload_url, storage_path } = await portalApi.post<{
        upload_url:   string
        storage_path: string
      }>('/documents/upload-url', {
        doc_type_id: docTypeId,
        file_name:   file.name,
        mime_type:   file.type,
      })

      await fetch(upload_url, {
        method:  'PUT',
        body:    file,
        headers: { 'Content-Type': file.type },
      })

      await registerDoc.mutateAsync({
        doc_type_id:  docTypeId,
        storage_path,
        file_name:    file.name,
        mime_type:    file.type,
      })
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(null)
    }
  }

  return (
    <main className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      <SectionHeader
        title="Compliance documents"
        subtitle="Upload required regulatory documents. All mandatory documents must be approved before your institution can submit bids."
      />

      <ComplianceBanner />

      {uploadError && (
        <InlineAlert variant="error" onDismiss={() => setUploadError(null)}>
          {uploadError}
        </InlineAlert>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <SkeletonRow key={i} cols={1} />)}
        </div>
      )}

      {!isLoading && (
        <>
          <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-ink/[0.07] bg-ink/1">
              <h3 className="text-[13px] font-bold text-ink">Required documents</h3>
              <p className="text-[11px] text-muted mt-0.5">
                All documents below must be approved to enable bidding.
              </p>
            </div>
            {mandatory.map(dt => (
              <DocRow
                key={dt.id}
                docType={dt}
                doc={docMap[dt.id]}
                onUpload={handleUpload}
                uploading={uploading}
              />
            ))}
          </div>

          {optional.length > 0 && (
            <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-ink/[0.07] bg-ink/1">
                <h3 className="text-[13px] font-bold text-ink">Optional documents</h3>
                <p className="text-[11px] text-muted mt-0.5">
                  Not required for bidding, but may be requested by Ficium during onboarding.
                </p>
              </div>
              {optional.map(dt => (
                <DocRow
                  key={dt.id}
                  docType={dt}
                  doc={docMap[dt.id]}
                  onUpload={handleUpload}
                  uploading={uploading}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
