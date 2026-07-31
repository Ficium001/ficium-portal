/**
 * @component PipelineTemplatesTab
 * @description
 *   Settings → Pipeline Templates.
 *   Writes to institution.pipeline_template + institution.pipeline_stage_def —
 *   the same tables used by marketplace.create_pipeline_from_acceptance().
 *
 *   Key concepts:
 *   - product_code = null → default template (fallback for any product)
 *   - product_code = "personal_loan" → specific template (takes priority over default)
 *   - is_default flag → only one default per institution
 *   - stage: requires_maker_checker, requires_documents, borrower_visible all
 *     directly affect pipeline execution and borrower tracker
 */
import { useState } from "react";
import {
  GitBranch, Plus, Trash2, Pencil, ChevronDown, ChevronUp,
  Clock, CheckCircle2, Eye, EyeOff, AlertCircle, Star,
} from "lucide-react";
import {
  useTemplates, useTemplate,
  useCreatePipelineTemplate, useUpdateTemplate,
  useAddStageDef, useUpdateStageDef, useDeleteStageDef,
} from "@/institution/pipeline/hooks/usePipeline";
import {
  SectionHeader, InlineAlert, Modal, FormField,
  inputCls, Btn, SkeletonCard,
} from "@/institution/components/primitives";
import type {
  PipelineTemplate, StageKey,
  CreateTemplatePayload, CreateStageDefPayload,
} from "@/institution/pipeline/types/pipeline";

// ─── Constants ────────────────────────────────────────────────────────────────

// Maps catalog.product.code → display label
const PRODUCT_LABELS: Record<string, string> = {
  personal_loan:  "Personal Loan",
  vehicle_loan:   "Vehicle Loan",
  home_loan:      "Home Loan",
  education_loan: "Education Loan",
  business_loan:  "Business Loan",
  credit_card:    "Credit Card",
};

const STAGE_KEY_LABELS: Record<StageKey, string> = {
  credit_docs:   "Credit Documentation",
  offer_letter:  "Offer Letter",
  legal_review:  "Legal Review",
  board_approval:"Board / Management Approval",
  disbursement:  "Disbursement",
  custom:        "Custom Stage",
};

const STAGE_KEYS = Object.keys(STAGE_KEY_LABELS) as StageKey[];
const PRODUCT_CODES = Object.keys(PRODUCT_LABELS);

// ─── Create template modal ────────────────────────────────────────────────────

function CreateTemplateModal({
  usedProductCodes,
  onClose,
}: {
  usedProductCodes: string[];
  onClose: () => void;
}) {
  const [name,        setName]        = useState("");
  const [productCode, setProductCode] = useState<string>("__default__");
  const [description, setDescription] = useState("");
  const [error,       setError]       = useState("");
  const create = useCreatePipelineTemplate();

  async function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Template name is required."); return; }
    const payload: CreateTemplatePayload = {
      name:         name.trim(),
      product_code: productCode === "__default__" ? null : productCode,
      description:  description.trim() || undefined,
      is_default:   productCode === "__default__",
    };
    try {
      await create.mutateAsync(payload);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create template.");
    }
  }

  const availableCodes = PRODUCT_CODES.filter(c => !usedProductCodes.includes(c));
  const defaultTaken   = usedProductCodes.includes("__default__");

  return (
    <Modal open title="New pipeline template" onClose={onClose}>
      <div className="space-y-4 p-1">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <FormField label="Template name" required>
          <input
            className={inputCls}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. MCB Standard Loan Pipeline"
            autoFocus
          />
        </FormField>

        <FormField
          label="Product scope"
          hint="Default applies to any product without a specific template."
          required
        >
          <select
            className={inputCls}
            value={productCode}
            onChange={e => setProductCode(e.target.value)}
          >
            {!defaultTaken && (
              <option value="__default__">Default (all products)</option>
            )}
            {availableCodes.map(c => (
              <option key={c} value={c}>{PRODUCT_LABELS[c] ?? c}</option>
            ))}
            {availableCodes.length === 0 && defaultTaken && (
              <option disabled value="">All product types covered</option>
            )}
          </select>
        </FormField>

        <FormField label="Description" hint="Internal note for your team.">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe when this pipeline applies..."
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={handleSubmit}
            disabled={create.isPending}
          >
            {create.isPending ? "Creating…" : "Create template"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Add / edit stage modal ───────────────────────────────────────────────────

type StageModalInitial = {
  id: string;
  stage_key: StageKey;
  label: string;
  description: string | null;
  sla_hours: number;
  requires_maker_checker: boolean;
  requires_documents: boolean;
  borrower_label: string | null;
  borrower_visible: boolean;
};

function StageModal({
  templateId,
  initial,
  onClose,
}: {
  templateId: string;
  initial?:   StageModalInitial;
  onClose:    () => void;
}) {
  const isEdit = !!initial;
  const [stageKey,    setStageKey]    = useState<StageKey>(initial?.stage_key ?? "custom");
  const [label,       setLabel]       = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [slaHours,    setSlaHours]    = useState(String(initial?.sla_hours ?? 48));
  const [rmc,         setRmc]         = useState(initial?.requires_maker_checker ?? false);
  const [rdoc,        setRdoc]        = useState(initial?.requires_documents ?? false);
  const [bLabel,      setBLabel]      = useState(initial?.borrower_label ?? "");
  const [bVisible,    setBVisible]    = useState(initial?.borrower_visible ?? true);
  const [error,       setError]       = useState("");

  const addStage    = useAddStageDef(templateId);
  const updateStage = useUpdateStageDef(templateId);

  async function handleSubmit() {
    setError("");
    if (!label.trim()) { setError("Stage label is required."); return; }
    const payload: CreateStageDefPayload = {
      stage_key:              stageKey,
      label:                  label.trim(),
      description:            description.trim() || undefined,
      sla_hours:              parseInt(slaHours, 10) || 48,
      requires_maker_checker: rmc,
      requires_documents:     rdoc,
      borrower_label:         bLabel.trim() || undefined,
      borrower_visible:       bVisible,
    };
    try {
      if (isEdit && initial) {
        await updateStage.mutateAsync({ stageId: initial.id, payload });
      } else {
        await addStage.mutateAsync(payload);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save stage.");
    }
  }

  return (
    <Modal open title={isEdit ? "Edit stage" : "Add stage"} onClose={onClose}>
      <div className="space-y-4 p-1">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Stage type">
            <select
              className={inputCls}
              value={stageKey}
              onChange={e => {
                const k = e.target.value as StageKey;
                setStageKey(k);
                if (!label || label === STAGE_KEY_LABELS[stageKey]) {
                  setLabel(STAGE_KEY_LABELS[k]);
                }
              }}
            >
              {STAGE_KEYS.map(k => (
                <option key={k} value={k}>{STAGE_KEY_LABELS[k]}</option>
              ))}
            </select>
          </FormField>

          <FormField label="SLA (hours)" hint="Default 48h">
            <input
              className={inputCls}
              type="number"
              min={1}
              value={slaHours}
              onChange={e => setSlaHours(e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Stage label" required hint="Shown to bank officers.">
          <input
            className={inputCls}
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Legal Review"
            autoFocus
          />
        </FormField>

        <FormField label="Description" hint="Instructions for the officer handling this stage.">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </FormField>

        <FormField label="Borrower label" hint="What the borrower sees in their loan tracker. Leave blank to hide.">
          <input
            className={inputCls}
            value={bLabel}
            onChange={e => setBLabel(e.target.value)}
            placeholder="e.g. Under review"
          />
        </FormField>

        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={bVisible}
              onChange={e => setBVisible(e.target.checked)}
              className="w-4 h-4 rounded-sm accent-ficium" />
            <div>
              <div className="text-[13px] font-medium text-ink">Visible to borrower</div>
              <div className="text-[11px] text-muted">Show this stage in the borrower's loan tracker</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={rmc}
              onChange={e => setRmc(e.target.checked)}
              className="w-4 h-4 rounded-sm accent-ficium" />
            <div>
              <div className="text-[13px] font-medium text-ink">Requires maker-checker</div>
              <div className="text-[11px] text-muted">Stage needs a second officer to approve before advancing</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={rdoc}
              onChange={e => setRdoc(e.target.checked)}
              className="w-4 h-4 rounded-sm accent-ficium" />
            <div>
              <div className="text-[13px] font-medium text-ink">Requires documents</div>
              <div className="text-[11px] text-muted">Stage is gated — documents must be uploaded before advancing</div>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={handleSubmit}
            disabled={addStage.isPending || updateStage.isPending}
          >
            {addStage.isPending || updateStage.isPending
              ? "Saving…"
              : isEdit ? "Save changes" : "Add stage"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ template }: { template: PipelineTemplate }) {
  const [expanded,    setExpanded]    = useState(false);
  const [stageModal,  setStageModal]  = useState<null | "add" | StageModalInitial>(null);
  const [toggleError, setToggleError] = useState("");

  const { data: detail, isLoading } = useTemplate(expanded ? template.id : "");
  const updateTemplate = useUpdateTemplate(template.id);
  const deleteStage    = useDeleteStageDef(template.id);

  const scopeLabel = template.product_code
    ? (PRODUCT_LABELS[template.product_code] ?? template.product_code)
    : "All products (default)";

  const noStages = template.stage_count === 0;

  function handleToggleActive() {
    setToggleError("");
    if (!template.is_active && noStages) {
      setToggleError("Add at least one stage before activating this template.");
      return;
    }
    updateTemplate.mutate(
      { is_active: !template.is_active },
      {
        onError: (e: unknown) =>
          setToggleError(e instanceof Error ? e.message : "Failed to update template."),
      },
    );
  }

  async function handleDeleteStage(stageId: string) {
    if (!confirm("Remove this stage?")) return;
    await deleteStage.mutateAsync(stageId);
  }

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all ${
      template.is_active ? "border-border" : "border-border/50 opacity-60"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-ficium/10 flex items-center justify-center shrink-0">
          <GitBranch size={16} className="text-ficium" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-ink">{template.name}</span>
            {template.is_default && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700
                               bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <Star size={9} fill="currentColor" /> Default
              </span>
            )}
            {!template.is_active && (
              <span className="text-[10px] font-bold text-muted bg-ink/6 rounded-full px-2 py-0.5">
                INACTIVE
              </span>
            )}
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            {scopeLabel} · {template.stage_count} stage{template.stage_count !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Active toggle */}
          <button
            onClick={handleToggleActive}
            disabled={updateTemplate.isPending}
            title={
              !template.is_active && noStages
                ? "Add a stage before activating"
                : template.is_active ? "Deactivate" : "Activate"
            }
            className={`w-9 h-5 rounded-full transition-colors relative ${
              template.is_active ? "bg-ficium" : "bg-ink/20"
            } ${!template.is_active && noStages ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              template.is_active ? "translate-x-[18px]" : "translate-x-0.5"
            }`} />
          </button>

          <button
            onClick={() => setExpanded(v => !v)}
            className="w-7 h-7 flex items-center justify-center text-muted hover:text-ink"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {toggleError && (
        <div className="px-4 pb-3 -mt-1">
          <InlineAlert variant="error">{toggleError}</InlineAlert>
        </div>
      )}

      {/* Stage list */}
      {expanded && (
        <div className="border-t border-border">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <>
              {detail && detail.stages.length > 0 ? (
                <div className="divide-y divide-border">
                  {detail.stages.map(stage => (
                    <div key={stage.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="w-6 h-6 rounded-full bg-ficium/10 flex items-center justify-center
                                      text-[11px] font-bold text-ficium shrink-0 mt-0.5">
                        {stage.position}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-medium text-ink">{stage.label}</span>
                          <span className="text-[10px] font-semibold text-muted bg-ink/6 rounded-sm px-1.5 py-0.5">
                            {STAGE_KEY_LABELS[stage.stage_key]}
                          </span>
                        </div>

                        {/* Stage flags */}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 text-[10px] text-muted">
                            <Clock size={10} /> {stage.sla_hours}h SLA
                          </span>
                          {stage.requires_maker_checker && (
                            <span className="flex items-center gap-1 text-[10px] text-purple-700">
                              <CheckCircle2 size={10} /> Maker-checker
                            </span>
                          )}
                          {stage.requires_documents && (
                            <span className="flex items-center gap-1 text-[10px] text-blue-700">
                              <CheckCircle2 size={10} /> Docs required
                            </span>
                          )}
                          {stage.borrower_visible ? (
                            <span className="flex items-center gap-1 text-[10px] text-green-700">
                              <Eye size={10} />
                              {stage.borrower_label
                                ? `"${stage.borrower_label}"`
                                : "Borrower visible"}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-muted">
                              <EyeOff size={10} /> Hidden from borrower
                            </span>
                          )}
                        </div>

                        {stage.description && (
                          <p className="text-[11px] text-muted mt-1 line-clamp-2">
                            {stage.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setStageModal(stage)}
                          className="w-7 h-7 flex items-center justify-center text-muted
                                     hover:text-ficium transition-colors rounded-lg hover:bg-ficium/8"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteStage(stage.id)}
                          disabled={deleteStage.isPending}
                          className="w-7 h-7 flex items-center justify-center text-muted
                                     hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-4 text-muted">
                  <AlertCircle size={16} className="shrink-0" />
                  <span className="text-[13px]">
                    No stages yet. Pipelines cannot start without at least one stage.
                  </span>
                </div>
              )}

              <div className="px-4 py-3 border-t border-border">
                <button
                  onClick={() => setStageModal("add")}
                  className="flex items-center gap-2 text-[13px] text-ficium
                             font-medium hover:opacity-80 transition-opacity"
                >
                  <Plus size={14} /> Add stage
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {stageModal === "add" && (
        <StageModal templateId={template.id} onClose={() => setStageModal(null)} />
      )}
      {stageModal && stageModal !== "add" && (
        <StageModal
          templateId={template.id}
          initial={stageModal}
          onClose={() => setStageModal(null)}
        />
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function PipelineTemplatesTab() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: templates = [], isLoading, error } = useTemplates();

  // Track which product codes (and the default slot) are already taken
  const usedProductCodes = templates
    .filter(t => t.is_active)
    .map(t => t.product_code ?? "__default__");

  const allSlotsTaken =
    usedProductCodes.includes("__default__") &&
    PRODUCT_CODES.every(c => usedProductCodes.includes(c));

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Pipeline templates"
        subtitle="Define the stages that run automatically when a borrower accepts your bid. The default template applies to any product without a specific one."
        actions={
          !allSlotsTaken && (
            <Btn
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowCreate(true)}
            >
              New template
            </Btn>
          )
        }
      />

      {error && (
        <InlineAlert variant="error">Failed to load templates. Please refresh.</InlineAlert>
      )}

      <InlineAlert variant="info">
        <strong>How it works:</strong> when a borrower accepts a bid, Ficium picks the
        most specific active template for that product type, falling back to the
        Default template. Stages run in order — maker-checker stages require a
        second officer to approve before advancing.
      </InlineAlert>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-ficium/10 flex items-center justify-center mb-3">
            <GitBranch size={22} className="text-ficium" />
          </div>
          <div className="text-[15px] font-semibold text-ink">No templates yet</div>
          <div className="text-[13px] text-muted mt-1 max-w-xs">
            Create a Default template to handle all loan types, then add
            product-specific ones for tailored workflows.
          </div>
          <Btn
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowCreate(true)}
            className="mt-4"
          >
            New template
          </Btn>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Default first, then by product code */}
          {[...templates]
            .sort((a, b) =>
              Number(b.is_default) - Number(a.is_default) ||
              (a.product_code ?? "").localeCompare(b.product_code ?? ""))
            .map(t => <TemplateCard key={t.id} template={t} />)
          }
          {allSlotsTaken && (
            <InlineAlert variant="info">
              All product types are covered. Deactivate a template to replace it.
            </InlineAlert>
          )}
        </div>
      )}

      {showCreate && (
        <CreateTemplateModal
          usedProductCodes={usedProductCodes}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
