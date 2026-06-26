/**
 * @page InstitutionOnboarding
 * @route /onboarding
 * @access authenticated institution user — pre-approval stage
 * @description
 *   Post-registration onboarding flow. Guides the institution's primary
 *   admin through four steps before the application enters Ficium's
 *   commercial review:
 *
 *     1. Welcome & checklist — what's needed for a fast approval
 *     2. Compliance documents — AML/CFT policy, FSC/BOM licence upload
 *     3. Technical preferences — deployment model, integration mode,
 *        API contact, webhook URL
 *     4. Submit — routes to /pending with application status tracker
 *
 *   All uploads go to Supabase Storage (institution-docs bucket).
 *   Metadata is written to institution_onboarding_docs.
 *   RPC: update_onboarding_stage('commercial_review') on submit.
 *
 *   The page is accessible to:
 *     - Users in onboarding_stage: registered | commercial_review
 *   Users in later stages are redirected to /pending or /dashboard.
 *
 * @dataSource
 *   useMyInstitution → institutions table
 *   institutionSupabase.storage → institution-docs bucket
 *
 * @owner Ficium Engineering
 * @lastReviewed 2025-08
 */

import { useState, useRef, useCallback } from "react";
import { useNavigate }  from "react-router-dom";
import {
  CheckCircle, Upload, FileText, Zap, Building2,
  ArrowRight, ArrowLeft, Globe,
} from "lucide-react";
import { useMyInstitution } from "@/institution/hooks/useInstitution";
import institutionSupabase  from "@/institution/lib/institutionSupabase";
import {
  InlineAlert, Btn, FormField, inputCls,
} from "@/institution/components/primitives";
import FiciumLogo from "@/shared/ui/FiciumLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface ComplianceDocs {
  amlPolicy?:     File;
  fscLicence?:    File;
  boardResolution?: File;
  proofOfAddress?: File;
}

interface TechPrefs {
  deploymentModel: "saas" | "paas" | "on_prem";
  integrationMode: "portal" | "webhook" | "api_pull" | "core_banking";
  itContactName:   string;
  itContactEmail:  string;
  webhookUrl:      string;
  expectedVolume:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1 as Step, label: "Welcome"     },
  { n: 2 as Step, label: "Documents"   },
  { n: 3 as Step, label: "Technical"   },
  { n: 4 as Step, label: "Review"      },
];

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-10" role="list" aria-label="Onboarding steps">
      {STEPS.map((step, i) => {
        const done   = step.n < current;
        const active = step.n === current;
        return (
          <div key={step.n} className="flex items-center" role="listitem">
            <div className="flex flex-col items-center">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all",
                  done   ? "bg-ficium text-white" :
                  active ? "bg-ficium text-white ring-4 ring-ficium/20" :
                           "bg-ink/[0.06] text-muted",
                ].join(" ")}
                aria-current={active ? "step" : undefined}
              >
                {done ? <CheckCircle className="w-4 h-4" /> : step.n}
              </div>
              <span className={`text-[10px] font-semibold mt-1.5 ${active ? "text-ficium" : "text-muted"}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-16 mx-1 mb-4 ${done ? "bg-ficium" : "bg-ink/[0.08]"}`} aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Welcome
// ─────────────────────────────────────────────────────────────────────────────

function Step1Welcome({
  institution,
  onNext,
}: {
  institution: { name: string; institution_type: string };
  onNext: () => void;
}) {
  const CHECKLIST = [
    { icon: FileText,  label: "AML/CFT policy document (PDF)"               },
    { icon: FileText,  label: "FSC or BOM operating licence"                 },
    { icon: FileText,  label: "Board resolution authorising this application" },
    { icon: Globe,     label: "IT contact for API integration"                },
    { icon: Zap,       label: "Webhook URL (optional — if using webhook mode)" },
  ];

  return (
    <div>
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-ficium/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-ficium" aria-hidden />
        </div>
        <h2 className="font-display text-[28px] font-bold text-ink mb-2">
          Welcome, {institution.name}
        </h2>
        <p className="text-[14px] text-muted max-w-md mx-auto">
          Complete this onboarding to activate your institution on the Ficium marketplace.
          It takes about 10 minutes.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink/[0.07] p-6 mb-6">
        <h3 className="font-display font-bold text-[15px] text-ink mb-4">
          What you will need
        </h3>
        <div className="space-y-3">
          {CHECKLIST.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-ficium/8 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-ficium" aria-hidden />
              </div>
              <span className="text-[13px] text-ink">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <InlineAlert variant="info">
        Your application enters <strong>commercial review</strong> once submitted.
        Ficium will contact your primary contact within 2 business days.
        Approval typically takes 5–10 business days.
      </InlineAlert>

      <div className="flex justify-end mt-6">
        <Btn variant="primary" icon={ArrowRight} onClick={onNext}>
          Start onboarding
        </Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Compliance documents
// ─────────────────────────────────────────────────────────────────────────────

function FileUploadField({
  label,
  hint,
  accept,
  required,
  file,
  onChange,
}: {
  label:    string;
  hint?:    string;
  accept:   string;
  required?: boolean;
  file?:    File;
  onChange: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <label className="text-[12px] font-semibold text-ink">{label}</label>
        {required
          ? <span className="text-[10px] text-red-500 font-semibold">Required</span>
          : <span className="text-[10px] text-muted">Optional</span>
        }
      </div>
      {hint && <p className="text-[11px] text-muted mb-2">{hint}</p>}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={[
          "w-full flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-4 transition-all text-left",
          file
            ? "border-emerald-300 bg-emerald-50"
            : "border-ink/[0.12] hover:border-ficium/40 hover:bg-ficium/[0.02]",
        ].join(" ")}
        aria-label={`Upload ${label}`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          file ? "bg-emerald-100" : "bg-ink/[0.04]"
        }`}>
          {file
            ? <CheckCircle className="w-4.5 h-4.5 text-emerald-600" aria-hidden />
            : <Upload className="w-4 h-4 text-muted" aria-hidden />
          }
        </div>
        <div className="flex-1 min-w-0">
          {file ? (
            <>
              <div className="text-[13px] font-semibold text-emerald-700 truncate">{file.name}</div>
              <div className="text-[11px] text-emerald-600">
                {(file.size / 1024).toFixed(0)} KB
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-medium text-ink">Click to upload</div>
              <div className="text-[11px] text-muted">{accept.replace(/\./g, "").toUpperCase()} · max 10 MB</div>
            </>
          )}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
    </div>
  );
}

function Step2Documents({
  docs,
  setDocs,
  onBack,
  onNext,
}: {
  docs:    ComplianceDocs;
  setDocs: (d: ComplianceDocs) => void;
  onBack:  () => void;
  onNext:  () => void;
}) {
  const canProceed = !!docs.amlPolicy && !!docs.fscLicence;

  return (
    <div>
      <h2 className="font-display text-[22px] font-bold text-ink mb-1">
        Compliance documents
      </h2>
      <p className="text-[13px] text-muted mb-6">
        Upload your institution's compliance documentation. These are reviewed by
        the Ficium compliance team before approval.
      </p>

      <div className="space-y-4 mb-6">
        <FileUploadField
          label="AML/CFT policy"
          hint="Your institution's Anti-Money Laundering and Combating Financing of Terrorism policy"
          accept=".pdf"
          required
          file={docs.amlPolicy}
          onChange={(f) => setDocs({ ...docs, amlPolicy: f })}
        />
        <FileUploadField
          label="FSC / BOM operating licence"
          hint="Current licence issued by the Financial Services Commission or Bank of Mauritius"
          accept=".pdf,.jpg,.png"
          required
          file={docs.fscLicence}
          onChange={(f) => setDocs({ ...docs, fscLicence: f })}
        />
        <FileUploadField
          label="Board resolution"
          hint="Board resolution authorising participation in the Ficium marketplace"
          accept=".pdf"
          file={docs.boardResolution}
          onChange={(f) => setDocs({ ...docs, boardResolution: f })}
        />
        <FileUploadField
          label="Proof of registered address"
          hint="Utility bill or official letter confirming registered business address"
          accept=".pdf,.jpg,.png"
          file={docs.proofOfAddress}
          onChange={(f) => setDocs({ ...docs, proofOfAddress: f })}
        />
      </div>

      <InlineAlert variant="info">
        Documents are encrypted at rest and accessible only to authorised Ficium staff.
        They are never shared with clients or third parties.
      </InlineAlert>

      <div className="flex items-center justify-between mt-6">
        <Btn variant="ghost" icon={ArrowLeft} onClick={onBack}>Back</Btn>
        <Btn variant="primary" icon={ArrowRight} onClick={onNext} disabled={!canProceed}>
          Continue
        </Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Technical preferences
// ─────────────────────────────────────────────────────────────────────────────

const DEPLOYMENT_OPTIONS = [
  { key: "saas" as const,    label: "SaaS (Ficium hosted)", description: "Fastest setup. Ficium manages all infrastructure." },
  { key: "paas" as const,    label: "PaaS (your cloud)",    description: "Deploy on your AWS/Azure account. More control." },
  { key: "on_prem" as const, label: "On-premises",          description: "Run entirely within your data centre. Requires IT lead." },
];

const INTEGRATION_OPTIONS = [
  { key: "portal" as const,       label: "Portal only",     description: "Analysts bid directly in this portal. No integration needed." },
  { key: "webhook" as const,      label: "Webhook",         description: "Receive real-time events at your HTTPS endpoint." },
  { key: "api_pull" as const,     label: "API pull",        description: "Your system polls the Ficium API on a schedule." },
  { key: "core_banking" as const, label: "Core banking",    description: "Deep integration with your core banking system. Professional services required." },
];

function SelectCard<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option:   { key: T; label: string; description: string };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 transition-all",
        selected
          ? "border-ficium bg-ficium/[0.04]"
          : "border-ink/[0.10] hover:border-ficium/30",
      ].join(" ")}
    >
      <div className={[
        "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all",
        selected ? "border-ficium bg-ficium" : "border-ink/20",
      ].join(" ")} aria-hidden />
      <div>
        <div className="text-[13px] font-semibold text-ink">{option.label}</div>
        <div className="text-[11px] text-muted mt-0.5">{option.description}</div>
      </div>
    </button>
  );
}

function Step3Technical({
  prefs,
  setPrefs,
  onBack,
  onNext,
}: {
  prefs:    TechPrefs;
  setPrefs: (p: TechPrefs) => void;
  onBack:   () => void;
  onNext:   () => void;
}) {
  const canProceed = !!prefs.itContactName.trim() && !!prefs.itContactEmail.trim();

  return (
    <div>
      <h2 className="font-display text-[22px] font-bold text-ink mb-1">
        Technical setup
      </h2>
      <p className="text-[13px] text-muted mb-6">
        Tell us how your institution will connect. Your IT team will be contacted for
        integration setup once your application is approved.
      </p>

      {/* Deployment model */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-ink uppercase tracking-wide mb-2.5">
          Deployment model
        </div>
        <div className="space-y-2">
          {DEPLOYMENT_OPTIONS.map((opt) => (
            <SelectCard
              key={opt.key}
              option={opt}
              selected={prefs.deploymentModel === opt.key}
              onSelect={() => setPrefs({ ...prefs, deploymentModel: opt.key })}
            />
          ))}
        </div>
      </div>

      {/* Integration mode */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-ink uppercase tracking-wide mb-2.5">
          Integration mode
        </div>
        <div className="space-y-2">
          {INTEGRATION_OPTIONS.map((opt) => (
            <SelectCard
              key={opt.key}
              option={opt}
              selected={prefs.integrationMode === opt.key}
              onSelect={() => setPrefs({ ...prefs, integrationMode: opt.key })}
            />
          ))}
        </div>
      </div>

      {/* IT contact */}
      <div className="bg-ink/[0.025] rounded-xl p-4 mb-6 space-y-4">
        <div className="text-[12px] font-bold text-ink uppercase tracking-wide">
          IT contact
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Full name">
            <input
              value={prefs.itContactName}
              onChange={(e) => setPrefs({ ...prefs, itContactName: e.target.value })}
              placeholder="Jane Smith"
              className={inputCls}
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={prefs.itContactEmail}
              onChange={(e) => setPrefs({ ...prefs, itContactEmail: e.target.value })}
              placeholder="it@yourbank.mu"
              className={inputCls}
            />
          </FormField>
        </div>
        {(prefs.integrationMode === "webhook" || prefs.integrationMode === "api_pull") && (
          <FormField
            label="Webhook / callback URL"
            hint="Must be HTTPS. TLS 1.2+. We will send test events to verify."
          >
            <input
              value={prefs.webhookUrl}
              onChange={(e) => setPrefs({ ...prefs, webhookUrl: e.target.value })}
              placeholder="https://your-system.example.com/ficium/events"
              type="url"
              className={inputCls}
            />
          </FormField>
        )}
        <FormField
          label="Expected monthly bid volume"
          hint="Approximate number of bids per month — helps us size your integration tier"
        >
          <select
            value={prefs.expectedVolume}
            onChange={(e) => setPrefs({ ...prefs, expectedVolume: e.target.value })}
            className={inputCls}
          >
            <option value="">Select range</option>
            <option value="lt50">Less than 50</option>
            <option value="50-200">50 – 200</option>
            <option value="200-1000">200 – 1,000</option>
            <option value="gt1000">More than 1,000</option>
          </select>
        </FormField>
      </div>

      <div className="flex items-center justify-between">
        <Btn variant="ghost" icon={ArrowLeft} onClick={onBack}>Back</Btn>
        <Btn variant="primary" icon={ArrowRight} onClick={onNext} disabled={!canProceed}>
          Review & submit
        </Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Review & Submit
// ─────────────────────────────────────────────────────────────────────────────

function Step4Review({
  institution,
  docs,
  prefs,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  institution: { name: string; legal_name: string; country: string; institution_type: string };
  docs:        ComplianceDocs;
  prefs:       TechPrefs;
  onBack:      () => void;
  onSubmit:    () => void;
  submitting:  boolean;
  error?:      string;
}) {
  const docCount = [docs.amlPolicy, docs.fscLicence, docs.boardResolution, docs.proofOfAddress]
    .filter(Boolean).length;

  const rows: [string, string][] = [
    ["Institution",      institution.name       ],
    ["Legal name",       institution.legal_name ],
    ["Type",             institution.institution_type.replace(/_/g, " ")],
    ["Country",          institution.country    ],
    ["Deployment",       prefs.deploymentModel  ],
    ["Integration",      prefs.integrationMode  ],
    ["IT contact",       `${prefs.itContactName} · ${prefs.itContactEmail}`],
    ["Documents",        `${docCount} uploaded` ],
    ["Expected volume",  prefs.expectedVolume || "Not specified"],
  ];

  return (
    <div>
      <h2 className="font-display text-[22px] font-bold text-ink mb-1">
        Review & submit
      </h2>
      <p className="text-[13px] text-muted mb-6">
        Confirm the details below. Submitting sends your application to Ficium's
        commercial review team.
      </p>

      <div className="bg-white rounded-xl border border-ink/[0.07] overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-ink/[0.07] bg-ink/[0.015]">
          <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
            Application summary
          </span>
        </div>
        <div className="divide-y divide-ink/[0.05]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center px-5 py-3">
              <div className="w-40 text-[12px] text-muted flex-shrink-0 capitalize">{label}</div>
              <div className="text-[13px] font-medium text-ink capitalize">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <InlineAlert variant="warning">
        By submitting, you confirm that all uploaded documents are genuine and that
        this application is authorised by your institution's board.
      </InlineAlert>

      {error && (
        <div className="mt-4">
          <InlineAlert variant="error">{error}</InlineAlert>
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <Btn variant="ghost" icon={ArrowLeft} onClick={onBack} disabled={submitting}>
          Back
        </Btn>
        <Btn variant="primary" onClick={onSubmit} loading={submitting}>
          Submit application
        </Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export default function InstitutionOnboarding() {
  const navigate = useNavigate();
  const { data: institution, isLoading } = useMyInstitution();

  const [step, setStep] = useState<Step>(1);
  const [docs, setDocs] = useState<ComplianceDocs>({});
  const [prefs, setPrefs] = useState<TechPrefs>({
    deploymentModel: "saas",
    integrationMode: "portal",
    itContactName:   "",
    itContactEmail:  "",
    webhookUrl:      "",
    expectedVolume:  "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  const uploadDocs = useCallback(async (institutionId: string) => {
    const toUpload = [
      { file: docs.amlPolicy,       name: "aml_policy"        },
      { file: docs.fscLicence,      name: "fsc_licence"       },
      { file: docs.boardResolution, name: "board_resolution"  },
      { file: docs.proofOfAddress,  name: "proof_of_address"  },
    ].filter((d): d is { file: File; name: string } => !!d.file);

    for (const { file, name } of toUpload) {
      const ext  = file.name.split(".").pop();
      const path = `${institutionId}/${name}.${ext}`;
      const { error } = await institutionSupabase.storage
        .from("institution-docs")
        .upload(path, file, { upsert: true });
      if (error) throw new Error(`Failed to upload ${name}: ${error.message}`);
    }
  }, [docs]);

  const handleSubmit = useCallback(async () => {
    if (!institution) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      // Upload documents
      await uploadDocs(institution.id);

      // Save tech preferences
      await institutionSupabase
        .from("institution_onboarding_prefs")
        .upsert({
          institution_id:   institution.id,
          deployment_model: prefs.deploymentModel,
          integration_mode: prefs.integrationMode,
          it_contact_name:  prefs.itContactName,
          it_contact_email: prefs.itContactEmail,
          webhook_url:      prefs.webhookUrl || null,
          expected_volume:  prefs.expectedVolume || null,
        }, { onConflict: "institution_id" });

      // Advance onboarding stage
      await institutionSupabase.rpc("update_onboarding_stage", {
        p_stage: "commercial_review",
      });

      navigate("/pending");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [institution, uploadDocs, prefs, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!institution) return null;

  // If already past onboarding, redirect away from the registration flow.
  if (!["registered", "commercial_review"].includes(institution.onboarding_stage)) {
    navigate("/pending");
    return null;
  }

  return (
    <div className="min-h-screen bg-cream flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <FiciumLogo heightPx={20} withWordmark wordmarkClassName="text-[18px] text-ink" />
        </div>

        <StepIndicator current={step} />

        {/* Card */}
        <div className="bg-white rounded-2xl border border-ink/[0.07] shadow-card p-7">
          {step === 1 && (
            <Step1Welcome
              institution={{ name: institution.name, institution_type: institution.institution_type }}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Documents
              docs={docs}
              setDocs={setDocs}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3Technical
              prefs={prefs}
              setPrefs={setPrefs}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <Step4Review
              institution={institution}
              docs={docs}
              prefs={prefs}
              onBack={() => setStep(3)}
              onSubmit={handleSubmit}
              submitting={submitting}
              error={submitError}
            />
          )}
        </div>

        <p className="text-center text-[12px] text-muted mt-6">
          Questions? Email{" "}
          <a href="mailto:institutions@ficium.mu" className="text-ficium font-semibold hover:underline">
            institutions@ficium.mu
          </a>
        </p>
      </div>
    </div>
  );
}
