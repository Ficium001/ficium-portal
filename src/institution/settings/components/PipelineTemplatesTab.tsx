/**
 * @component PipelineTemplatesTab
 * @description
 *   Institution Settings → Pipeline Templates tab.
 *   Banks configure the stage sequence that auto-runs when a borrower
 *   accepts their bid. One template per product type (personal_loan,
 *   sme_loan, mortgage, etc.).
 *
 *   UX:
 *     - Template list: cards per product type, stage count badge, active toggle
 *     - Expand a template to see / edit its stages inline
 *     - "+ Add stage" appends to the end; trash removes; pencil opens edit modal
 *     - "+ New template" opens a create modal (name + product type required)
 *
 * @module inst:pipeline
 */

import { useState } from "react";
import {
  GitBranch, Plus, Trash2, Pencil, ChevronDown, ChevronUp,
  Clock, CheckCircle2, Circle, AlertCircle,
} from "lucide-react";
import {
  useTemplates, useTemplate,
  useCreateTemplate, useUpdateTemplate,
  useAddStage, useUpdateStage, useDeleteStage,
} from "@/institution/pipeline/hooks/usePipeline";
import {
  SectionHeader, InlineAlert, Modal, FormField,
  inputCls, Btn, SkeletonCard,
} from "@/institution/components/primitives";
import type {
  PipelineTemplate, ProductType, StageType,
  CreateTemplatePayload, CreateStagePayload,
} from "@/institution/pipeline/types/pipeline";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCT_LABELS: Record<ProductType, string> = {
  personal_loan:  "Personal Loan",
  sme_loan:       "SME Loan",
  mortgage:       "Mortgage",
  auto_loan:      "Auto Loan",
  education_loan: "Education Loan",
  general:        "General",
};

const STAGE_TYPE_LABELS: Record<StageType, string> = {
  credit_docs:   "Credit Documentation",
  offer_letter:  "Offer Letter",
  legal_review:  "Legal Review",
  approval_gate: "Approval Gate",
  custom:        "Custom Stage",
};

const PRODUCT_TYPES = Object.keys(PRODUCT_LABELS) as ProductType[];
const STAGE_TYPES   = Object.keys(STAGE_TYPE_LABELS) as StageType[];

// ─── Create template modal ────────────────────────────────────────────────────

interface CreateTemplateModalProps {
  usedProductTypes: ProductType[];
  onClose: () => void;
}

function CreateTemplateModal({ usedProductTypes, onClose }: CreateTemplateModalProps) {
  const [name,        setName]        = useState("");
  const [productType, setProductType] = useState<ProductType>("personal_loan");
  const [description, setDescription] = useState("");
  const [error,       setError]       = useState("");

  const create = useCreateTemplate();

  const availableTypes = PRODUCT_TYPES.filter((t) => !usedProductTypes.includes(t));

  async function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Template name is required."); return; }

    const payload: CreateTemplatePayload = {
      name: name.trim(),
      product_type: productType,
      description:  description.trim() || undefined,
    };

    try {
      await create.mutateAsync(payload);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create template.");
    }
  }

  return (
    <Modal title="New pipeline template" onClose={onClose}>
      <div className="space-y-4 p-1">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <FormField label="Template name" required>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. MCB Personal Loan Pipeline"
            autoFocus
          />
        </FormField>

        <FormField label="Product type" required hint="One active template per product type.">
          <select
            className={inputCls}
            value={productType}
            onChange={(e) => setProductType(e.target.value as ProductType)}
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>{PRODUCT_LABELS[t]}</option>
            ))}
            {availableTypes.length === 0 && (
              <option disabled value="">All product types already have templates</option>
            )}
          </select>
        </FormField>

        <FormField label="Description" hint="Optional — internal note for your team.">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this pipeline's purpose or rules..."
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={handleSubmit}
            disabled={create.isPending || availableTypes.length === 0}
          >
            {create.isPending ? "Creating…" : "Create template"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Add / edit stage modal ───────────────────────────────────────────────────

interface StageModalProps {
  templateId: string;
  initial?:   { id: string; name: string; stage_type: StageType; description: string | null; is_required: boolean; sla_hours: number | null };
  onClose:    () => void;
}

function StageModal({ templateId, initial, onClose }: StageModalProps) {
  const isEdit = !!initial;

  const [name,       setName]       = useState(initial?.name        ?? "");
  const [stageType,  setStageType]  = useState<StageType>(initial?.stage_type ?? "custom");
  const [description,setDescription]= useState(initial?.description ?? "");
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? true);
  const [slaHours,   setSlaHours]   = useState<string>(initial?.sla_hours?.toString() ?? "");
  const [error,      setError]      = useState("");

  const addStage    = useAddStage(templateId);
  const updateStage = useUpdateStage(templateId);

  async function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Stage name is required."); return; }

    const payload: CreateStagePayload = {
      name:        name.trim(),
      stage_type:  stageType,
      description: description.trim() || undefined,
      is_required: isRequired,
      sla_hours:   slaHours ? parseInt(slaHours, 10) : undefined,
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

  const isPending = addStage.isPending || updateStage.isPending;

  return (
    <Modal title={isEdit ? "Edit stage" : "Add stage"} onClose={onClose}>
      <div className="space-y-4 p-1">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <FormField label="Stage name" required>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Legal Review"
            autoFocus
          />
        </FormField>

        <FormField label="Stage type">
          <select
            className={inputCls}
            value={stageType}
            onChange={(e) => setStageType(e.target.value as StageType)}
          >
            {STAGE_TYPES.map((t) => (
              <option key={t} value={t}>{STAGE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Description" hint="Shown to the bank officer handling this stage.">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs to happen at this stage..."
          />
        </FormField>

        <FormField label="SLA (hours)" hint="Leave blank for no SLA deadline.">
          <input
            className={inputCls}
            type="number"
            min={1}
            value={slaHours}
            onChange={(e) => setSlaHours(e.target.value)}
            placeholder="e.g. 48"
          />
        </FormField>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
            className="w-4 h-4 rounded accent-ficium"
          />
          <div>
            <div className="text-[13px] font-medium text-ink">Required stage</div>
            <div className="text-[11px] text-muted">Cannot be skipped during pipeline execution.</div>
          </div>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add stage"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Template card with expanded stage list ────────────────────────────────────

interface TemplateCardProps {
  template: PipelineTemplate;
}

function TemplateCard({ template }: TemplateCardProps) {
  const [expanded,   setExpanded]   = useState(false);
  const [stageModal, setStageModal] = useState<
    null | "add" | { id: string; name: string; stage_type: StageType; description: string | null; is_required: boolean; sla_hours: number | null }
  >(null);

  const { data: detail, isLoading } = useTemplate(expanded ? template.id : "");
  const toggleActive = useUpdateTemplate(template.id);
  const deleteStage  = useDeleteStage(template.id);

  async function handleToggleActive() {
    await toggleActive.mutateAsync({ is_active: !template.is_active });
  }

  async function handleDeleteStage(stageId: string) {
    if (!confirm("Remove this stage?")) return;
    await deleteStage.mutateAsync(stageId);
  }

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all ${
      template.is_active ? "border-border" : "border-border/50 opacity-60"
    }`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-ficium/10 flex items-center justify-center flex-shrink-0">
          <GitBranch size={16} className="text-ficium" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-ink truncate">{template.name}</span>
            {!template.is_active && (
              <span className="text-[10px] font-bold text-muted bg-ink/[0.06] rounded-full px-2 py-0.5">
                INACTIVE
              </span>
            )}
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            {PRODUCT_LABELS[template.product_type]} · {template.stage_count} stage{template.stage_count !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Active toggle */}
          <button
            onClick={handleToggleActive}
            disabled={toggleActive.isPending}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              template.is_active ? "bg-ficium" : "bg-ink/20"
            }`}
            title={template.is_active ? "Deactivate template" : "Activate template"}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              template.is_active ? "translate-x-[18px]" : "translate-x-0.5"
            }`} />
          </button>

          {/* Expand / collapse */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-7 h-7 flex items-center justify-center text-muted hover:text-ink transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

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
                  {detail.stages.map((stage) => (
                    <div key={stage.id} className="flex items-start gap-3 px-4 py-3">
                      {/* Position badge */}
                      <div className="w-6 h-6 rounded-full bg-ficium/10 flex items-center justify-center
                                      text-[11px] font-bold text-ficium flex-shrink-0 mt-0.5">
                        {stage.position}
                      </div>

                      {/* Stage info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-medium text-ink">{stage.name}</span>
                          <span className="text-[10px] font-semibold text-muted bg-ink/[0.06]
                                           rounded px-1.5 py-0.5">
                            {STAGE_TYPE_LABELS[stage.stage_type]}
                          </span>
                          {stage.is_required ? (
                            <span className="flex items-center gap-1 text-[10px] text-green-700">
                              <CheckCircle2 size={10} /> Required
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-muted">
                              <Circle size={10} /> Optional
                            </span>
                          )}
                          {stage.sla_hours && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-700">
                              <Clock size={10} /> {stage.sla_hours}h SLA
                            </span>
                          )}
                        </div>
                        {stage.description && (
                          <p className="text-[12px] text-muted mt-0.5 line-clamp-2">
                            {stage.description}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setStageModal(stage)}
                          className="w-7 h-7 flex items-center justify-center text-muted
                                     hover:text-ficium transition-colors rounded-lg hover:bg-ficium/[0.08]"
                          title="Edit stage"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteStage(stage.id)}
                          disabled={deleteStage.isPending}
                          className="w-7 h-7 flex items-center justify-center text-muted
                                     hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                          title="Remove stage"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-4 text-muted">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span className="text-[13px]">
                    No stages yet. Add at least one stage before this template can be used.
                  </span>
                </div>
              )}

              {/* Add stage button */}
              <div className="px-4 py-3 border-t border-border">
                <button
                  onClick={() => setStageModal("add")}
                  className="flex items-center gap-2 text-[13px] text-ficium font-medium
                             hover:opacity-80 transition-opacity"
                >
                  <Plus size={14} /> Add stage
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stage modal */}
      {stageModal === "add" && (
        <StageModal
          templateId={template.id}
          onClose={() => setStageModal(null)}
        />
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

  const usedProductTypes = templates.map((t) => t.product_type);
  const allUsed          = usedProductTypes.length >= PRODUCT_TYPES.length;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Pipeline templates"
        subtitle="Define the processing stages that run automatically when a borrower accepts your bid."
        actions={
          !allUsed && (
            <Btn
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
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
            Create a pipeline template for each loan type you offer. Stages run
            sequentially from bid acceptance through to disbursement.
          </div>
          <Btn
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowCreate(true)}
            className="mt-4"
          >
            New template
          </Btn>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
          {allUsed && (
            <InlineAlert variant="info">
              All product types have templates. Deactivate one to create an alternative.
            </InlineAlert>
          )}
        </div>
      )}

      {showCreate && (
        <CreateTemplateModal
          usedProductTypes={usedProductTypes.filter((t): t is ProductType =>
            templates.filter((x) => x.is_active).map((x) => x.product_type).includes(t)
          )}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
