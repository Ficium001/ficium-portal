/**
 * @page InstitutionSettings
 * @route /settings
 * @access protected — admin (write), all roles (read)
 * @description
 *   Institution configuration hub. Tabbed into four sections:
 *     - Profile     — read-only institution identity; contact Ficium to update
 *     - Team        — member list; invite (maker-checker); role display
 *     - API keys    — generate / revoke integration keys (maker-checker)
 *     - SLA config  — bid window and auto-withdrawal minutes per product
 *
 *   Admin-only mutations (invite, generate key, revoke) all route
 *   through submit_for_approval() and appear in /approvals.
 *
 * @dataSource
 *   useMyInstitution   → institutions table (5 min cache)
 *   useMyRole          → institution_members (10 min cache)
  *   useProducts         → products table (1 hr cache)
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useRef } from "react";
import {
  Building2, Key, Clock, Check, FolderCheck,
  Upload, CheckCircle2, XCircle, AlertCircle, ExternalLink, ShieldCheck, ShieldAlert,
  GitBranch, Webhook,
} from "lucide-react";
import {
  useMyInstitution, useMyRole, useProducts,
  useDocuments, useDocTypes, useCompliance, useRegisterDocument,
} from "@/institution/hooks/useInstitution";
import { useMyGroup } from "@/admin/hooks/useAdmin";
import type { Institution, DocType, InstitutionDoc } from "@/institution/types/institution";
import { portalApi } from "@/shared/lib/portalApi";
import {
  SectionHeader, StatusBadge, InlineAlert,
  Btn,
} from "@/institution/components/primitives";
import { PipelineTemplatesTab } from "@/institution/settings/components/PipelineTemplatesTab";
import { ApiKeysTab }           from "@/institution/settings/components/ApiKeysTab";
import { WebhooksTab }          from "@/institution/settings/components/WebhooksTab";

// ─────────────────────────────────────────────────────────────────────────────
// Tab types
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "profile" | "api-keys" | "webhooks" | "sla" | "documents" | "pipeline";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "profile",   label: "Profile",    icon: Building2    },
  { key: "api-keys",  label: "API keys",   icon: Key          },
  { key: "webhooks",  label: "Webhooks",   icon: Webhook      },
  { key: "sla",       label: "SLA",        icon: Clock        },
  { key: "documents", label: "Documents",  icon: FolderCheck  },
  { key: "pipeline",  label: "Pipelines",  icon: GitBranch    },
];

// ─────────────────────────────────────────────────────────────────────────────
// ProfileTab
// ─────────────────────────────────────────────────────────────────────────────

function ProfileTab({ institution }: { institution: Institution }) {
  const fields: [string, string][] = [
    ["Institution name",  institution.name],
    ["Legal name",        institution.legal_name],
    ["Type",              institution.institution_type.replace(/_/g, " ")],
    ["Deployment model",  institution.deployment_model],
    ["Country",           institution.country],
    ["Regulator",         institution.regulator ?? "—"],
    ["Reg number",        institution.reg_number ?? "—"],
    ["Contact email",     institution.primary_contact_email ?? "—"],
    ["Contact phone",     institution.primary_contact_phone ?? "—"],
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-ink/[0.07] flex items-center justify-between">
          <h2 className="font-display font-bold text-[15px] text-ink">Institution profile</h2>
          <p className="text-[11px] text-muted">To update, contact your Ficium account manager</p>
        </div>
        <div className="divide-y divide-ink/5">
          {fields.map(([label, value]) => (
            <div key={label} className="flex items-center px-5 py-3.5">
              <div className="w-44 text-[12px] text-muted shrink-0">{label}</div>
              <div className="text-[13px] font-medium text-ink capitalize">{value}</div>
            </div>
          ))}
          {/* Compliance status */}
          <div className="flex items-center px-5 py-3.5">
            <div className="w-44 text-[12px] text-muted shrink-0">Compliance status</div>
            <StatusBadge status={institution.compliance_status} size="xs" />
          </div>
          {/* Onboarding stage */}
          <div className="flex items-center px-5 py-3.5">
            <div className="w-44 text-[12px] text-muted shrink-0">Onboarding stage</div>
            <StatusBadge status={institution.onboarding_stage} size="xs"
              label={institution.onboarding_stage.replace(/_/g, " ")} />
          </div>
        </div>
        {/* Licensed modules */}
        <div className="px-5 py-4 border-t border-ink/[0.07]">
          <div className="text-[12px] text-muted mb-2.5">Licensed modules</div>
          <div className="flex gap-2 flex-wrap">
            {institution.modules.map((m) => (
              <span
                key={m}
                className="bg-ficium/8 text-ficium border border-ficium/20 text-[11px] font-semibold px-3 py-1 rounded-full"
              >
                {m}
              </span>
            ))}
            {institution.modules.length === 0 && (
              <span className="text-[12px] text-muted italic">No modules assigned yet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SlaTab
// ─────────────────────────────────────────────────────────────────────────────

function SlaTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: products = [], isLoading } = useProducts();
  const [values, setValues] = useState<Record<string, { bid: number; auto: number }>>({});
  const [saved,  setSaved]  = useState<Record<string, boolean>>({});

  const getVal = (code: string) => values[code] ?? { bid: 240, auto: 300 };

  const setVal = (code: string, field: "bid" | "auto", v: number) =>
    setValues((prev) => ({ ...prev, [code]: { ...getVal(code), [field]: v } }));

  const handleSave = async (code: string) => {
    const v = getVal(code);
    await portalApi.post("/sla-config", {
      product_code:          code,
      bid_window_minutes:    v.bid,
      auto_withdraw_minutes: v.auto,
    });
    setSaved((prev) => ({ ...prev, [code]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [code]: false })), 2500);
  };

  return (
    <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
      <div className="px-5 py-4 border-b border-ink/[0.07]">
        <h2 className="font-display font-bold text-[15px] text-ink">SLA configuration</h2>
        <p className="text-[11px] text-muted mt-0.5">
          Bid window and auto-withdrawal timeouts per product. Changes take effect immediately.
        </p>
      </div>
      {isLoading ? (
        <div className="divide-y divide-ink/5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
              <div className="flex-1 h-4 bg-ink/6 rounded-sm w-32" />
              <div className="h-8 w-24 bg-ink/5 rounded-lg" />
              <div className="h-8 w-24 bg-ink/5 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-ink/5">
          {products.map((p) => {
            const v = getVal(p.code);
            return (
              <div
                key={p.id}
                className="flex items-center gap-4 px-5 py-4 flex-wrap"
              >
                <div className="flex-1 min-w-[140px]">
                  <div className="text-[13px] font-semibold text-ink">{p.label}</div>
                  <code className="text-[11px] text-muted font-mono">{p.code}</code>
                </div>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                      Bid window (min)
                    </label>
                    <input
                      type="number"
                      value={v.bid}
                      onChange={(e) => setVal(p.code, "bid", Number(e.target.value))}
                      disabled={!isAdmin}
                      min={15}
                      max={1440}
                      className="w-24 border border-ink/12 rounded-lg px-3 py-2 text-[13px] outline-hidden focus:border-ficium focus:ring-2 focus:ring-ficium/20 disabled:bg-ink/2 disabled:text-muted"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                      Auto-withdraw (min)
                    </label>
                    <input
                      type="number"
                      value={v.auto}
                      onChange={(e) => setVal(p.code, "auto", Number(e.target.value))}
                      disabled={!isAdmin}
                      min={15}
                      max={2880}
                      className="w-24 border border-ink/12 rounded-lg px-3 py-2 text-[13px] outline-hidden focus:border-ficium focus:ring-2 focus:ring-ficium/20 disabled:bg-ink/2 disabled:text-muted"
                    />
                  </div>
                  {isAdmin && (
                    <Btn
                      variant={saved[p.code] ? "secondary" : "primary"}
                      size="sm"
                      icon={saved[p.code] ? Check : undefined}
                      onClick={() => handleSave(p.code)}
                    >
                      {saved[p.code] ? "Saved" : "Save"}
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────────────────────────────────────
// DocumentsTab — compliance document upload and status
// ─────────────────────────────────────────────────────────────────────────────

const DOC_STATUS_CFG = {
  approved:     { label: "Approved",       Icon: CheckCircle2, cls: "text-emerald-600" },
  pending:      { label: "Pending review", Icon: Clock,        cls: "text-amber-500"   },
  rejected:     { label: "Rejected",       Icon: XCircle,      cls: "text-red-500"     },
  expired:      { label: "Expired",        Icon: AlertCircle,  cls: "text-red-500"     },
  not_uploaded: { label: "Not uploaded",   Icon: AlertCircle,  cls: "text-ink/30"      },
} as const;

function ComplianceBanner() {
  const { data } = useCompliance();
  if (!data) return null;
  if (data.can_bid) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl mb-6">
        <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
        <div>
          <p className="text-[13px] font-bold text-emerald-800">Compliance verified</p>
          <p className="text-[12px] text-emerald-700">All required documents approved. Your institution can submit bids.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
      <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-[13px] font-bold text-amber-800">Compliance incomplete</p>
        <p className="text-[12px] text-amber-700 mt-0.5">
          {data.missing_docs.length > 0
            ? `Missing: ${data.missing_docs.join(", ")}.`
            : "Some documents are pending review or require re-upload."}{" "}
          Bid submission is locked until all mandatory documents are approved by Ficium.
        </p>
      </div>
    </div>
  );
}

function DocRow({
  docType, doc, onUpload, uploading,
}: {
  docType: DocType; doc: InstitutionDoc | undefined;
  onUpload: (id: string, file: File) => Promise<void>; uploading: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const status = (doc?.status ?? "not_uploaded") as keyof typeof DOC_STATUS_CFG;
  const { label, Icon, cls } = DOC_STATUS_CFG[status];
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string ?? "";

  return (
    <div className="flex items-start gap-4 px-5 py-4 border-b border-ink/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-ink">{docType.label}</span>
          {docType.is_mandatory
            ? <span className="text-[10px] font-bold text-red-500">REQUIRED</span>
            : <span className="text-[10px] text-muted">Optional</span>}
        </div>
        {docType.description && <p className="text-[11px] text-muted mt-0.5">{docType.description}</p>}
        <div className="flex items-center gap-1.5 mt-1.5">
          <Icon size={12} className={cls} />
          <span className="text-[11px] text-muted">{label}</span>
          {doc?.uploaded_at && (
            <span className="text-[11px] text-muted">· {new Date(doc.uploaded_at).toLocaleDateString()}</span>
          )}
        </div>
        {doc?.rejection_reason && (
          <p className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded-lg mt-1">{doc.rejection_reason}</p>
        )}
        {doc && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] text-muted truncate max-w-[200px]">{doc.file_name}</span>
            <a
              href={`${supabaseUrl}/storage/v1/object/public/institution-docs/${doc.storage_path}`}
              target="_blank" rel="noopener noreferrer"
              className="text-ficium hover:text-ficium/70"
            >
              <ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>
      <div className="shrink-0">
        <input ref={ref} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
          onChange={async e => {
            const file = e.target.files?.[0];
            if (file) await onUpload(docType.id, file);
            e.target.value = "";
          }}
        />
        <Btn
          variant={doc?.status === "approved" ? "ghost" : "secondary"}
          size="sm"
          loading={uploading === docType.id}
          onClick={() => ref.current?.click()}
        >
          <Upload size={12} />
          {doc ? "Re-upload" : "Upload"}
        </Btn>
      </div>
    </div>
  );
}

function DocumentsTab() {
  const { data: docTypes = [], isLoading: typesLoading } = useDocTypes();
  const { data: docs = [],     isLoading: docsLoading  } = useDocuments();
  const registerDoc = useRegisterDocument();
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const docMap = Object.fromEntries(docs.map(d => [d.doc_type_id, d]));
  const mandatory = docTypes.filter(dt => dt.is_mandatory);
  const optional  = docTypes.filter(dt => !dt.is_mandatory);
  const isLoading = typesLoading || docsLoading;

  const handleUpload = async (docTypeId: string, file: File) => {
    setUploadError(null);
    setUploading(docTypeId);
    try {
      const { upload_url, storage_path } = await portalApi.post<{
        upload_url: string; storage_path: string;
      }>("/documents/upload-url", { doc_type_id: docTypeId, file_name: file.name, mime_type: file.type });

      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

      await registerDoc.mutateAsync({
        doc_type_id: docTypeId, storage_path, file_name: file.name, mime_type: file.type,
      });
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div>
      <ComplianceBanner />
      {uploadError && (
        <div className="mb-4">
          <InlineAlert variant="error" onDismiss={() => setUploadError(null)}>{uploadError}</InlineAlert>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-ink/4 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-ink/[0.07] bg-ink/1">
              <h3 className="text-[13px] font-bold text-ink">Required documents</h3>
              <p className="text-[11px] text-muted mt-0.5">All must be approved by Ficium before your institution can bid.</p>
            </div>
            {mandatory.map(dt => (
              <DocRow key={dt.id} docType={dt} doc={docMap[dt.id]} onUpload={handleUpload} uploading={uploading} />
            ))}
          </div>
          {optional.length > 0 && (
            <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-ink/[0.07] bg-ink/1">
                <h3 className="text-[13px] font-bold text-ink">Optional documents</h3>
                <p className="text-[11px] text-muted mt-0.5">Not required for bidding but may be requested during onboarding.</p>
              </div>
              {optional.map(dt => (
                <DocRow key={dt.id} docType={dt} doc={docMap[dt.id]} onUpload={handleUpload} uploading={uploading} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionSettings() {
  const [tab,            setTab] = useState<Tab>("profile");
  const { data: institution }    = useMyInstitution();
  const { data: role }           = useMyRole();
  const { data: myGroup }        = useMyGroup();

  // Resolve admin from the group already working in the shell (useMyRole
  // may return undefined if institution_members query fails)
  const isAdmin =
    role?.role === "admin" || !!role?.is_primary_admin ||
    !!(myGroup?.label?.toLowerCase().includes("admin"));

  return (
    <main className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <SectionHeader
        title="Settings"
        subtitle={institution?.name}
      />

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 bg-ink/4 p-1 rounded-xl mb-6 w-fit"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
              tab === t.key ? "bg-white shadow-xs text-ink" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            <t.icon className="w-3.5 h-3.5" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "profile"   && institution && <ProfileTab institution={institution} />}
      {tab === "api-keys"  && <ApiKeysTab  isAdmin={isAdmin} />}
      {tab === "webhooks"  && <WebhooksTab isAdmin={isAdmin} />}
      {tab === "sla"       && <SlaTab      isAdmin={isAdmin} />}
      {tab === "documents" && <DocumentsTab />}
      {tab === "pipeline"  && <PipelineTemplatesTab />}
    </main>
  );
}
