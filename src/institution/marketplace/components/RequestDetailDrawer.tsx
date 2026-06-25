import { useState }        from "react";
import { X, FileText, MessageSquare, Download, User, DollarSign, TrendingUp, Zap } from "lucide-react";
import institutionSupabase from "@/institution/lib/institutionSupabase";
import RequestChat         from "@/shared/components/RequestChat";

import type { MarketplaceRequest } from "@/institution/types/institution";
import { SectionLabel, DetailStat, ProfileStat } from "./MarketplacePrimitives";

interface RequestDetailDrawerProps {
  request: MarketplaceRequest;
  onClose: () => void;
  onBid:   () => void;
}

const fmt     = (v: number) => v >= 1_000_000 ? `MUR ${(v / 1_000_000).toFixed(1)}M` : `MUR ${Number(v).toLocaleString()}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Resolve Phase 1 metadata — prefer new path, fall back to legacy flat fields
function useResolvedFields(request: MarketplaceRequest) {
  const m = request.metadata;
  const p = request.params;
  const ref = request.consumer_ref ?? request.client_ref;

  return {
    m, p, ref,
    productLabel:  request.product_label ?? request.product_type,
    familyLabel:   request.product_family_label ?? request.family_label,
    loanPurpose:   p?.loan_purpose ?? request.purpose,
    // Profile — Phase 1 preferred, legacy fallback
    healthScore:         m?.health_score          ?? request.client_health_score,
    affordabilityScore:  m?.affordability_score   ?? request.client_affordability_score,
    riskScore:           m?.risk_score            ?? request.client_risk_score,
    employmentStatus:    m?.employment_status     ?? request.client_employment_status,
    incomeBand:          m?.income_band           ?? (request.client_monthly_income ? fmt(request.client_monthly_income) : null),
    netWorthBand:        m?.net_worth_band        ?? (request.client_net_worth ? fmt(request.client_net_worth) : null),
    country:             request.country          ?? request.client_country,
    dsrCurrent:          m?.dsr_current_pct,
    dsrPost:             m?.dsr_post_pct,
    riskTier:            m?.risk_tier,
    kycVerified:         m?.kyc_verified,
    collateralType:      p?.collateral_type,
    collateralSub:       p?.collateral_sub,
    ltvPct:              p?.ltv_pct,
  };
}

function accentScore(v: number | null | undefined) {
  if (v == null) return undefined;
  return v >= 70 ? "green" : v >= 50 ? "amber" : "red";
}
function accentDSR(v: number | null | undefined) {
  if (v == null) return undefined;
  return v < 40 ? "green" : v < 55 ? "amber" : "red";
}
function accentTier(t: string | null | undefined) {
  if (!t) return undefined;
  return t === "A" ? "green" : t === "B" ? "amber" : "red";
}
function accentLTV(v: number | null | undefined) {
  if (v == null) return undefined;
  return v < 80 ? "green" : v < 90 ? "amber" : "red";
}
function fmtCollateral(c: string | null | undefined) {
  return c ? c.replace(/_/g, " ") : null;
}

export function RequestDetailDrawer({ request, onClose, onBid }: RequestDetailDrawerProps) {
  const [tab,             setTab]             = useState<"details" | "chat">("details");
  const [markerComment,   setMarkerComment]   = useState("");
  const [approverComment, setApproverComment] = useState("");

  const isUrgent = new Date(request.bid_window_closes_at).getTime() - Date.now() < 60 * 60 * 1000;
  const f = useResolvedFields(request);
  const refDisplay = f.ref?.slice(0, 8) ?? "—";

  const downloadPDF = () => {
    const dsr = f.dsrCurrent != null && f.dsrPost != null
      ? `${f.dsrCurrent}% → ${f.dsrPost}% (post-loan)` : "—";
    const ltv  = f.ltvPct  != null ? `${f.ltvPct}%`  : "—";
    const col  = [fmtCollateral(f.collateralType), f.collateralSub].filter(Boolean).join(" / ") || "—";

    const lines = [
      `FICIUM — REQUEST DOSSIER`,
      `Generated: ${new Date().toLocaleString("en-MU")}`,
      `${"─".repeat(48)}`,
      `Product:        ${f.productLabel}`,
      `Family:         ${f.familyLabel ?? "—"}`,
      `Status:         Open`,
      `Amount:         ${fmt(Number(request.amount))}`,
      `Term:           ${request.term_months ? `${request.term_months} months` : "—"}`,
      `Submitted:      ${fmtDate(request.created_at)}`,
      `Bid window:     ${fmtDate(request.bid_window_closes_at)}`,
      `Ref:            #${refDisplay}`,
      ...(f.loanPurpose ? [`Purpose:        ${f.loanPurpose}`] : []),
      `${"─".repeat(48)}`,
      `ANONYMOUS CLIENT PROFILE`,
      `KYC:            ${f.kycVerified ? "Verified" : "—"}`,
      `Risk tier:      ${f.riskTier ?? "—"}`,
      `Credit score:   ${f.healthScore != null ? `${f.healthScore}/100` : "—"}`,
      `Affordability:  ${f.affordabilityScore != null ? `${f.affordabilityScore}/100` : "—"}`,
      `Risk score:     ${f.riskScore != null ? `${f.riskScore}/100` : "—"}`,
      `Employment:     ${f.employmentStatus?.replace(/_/g, " ") ?? "—"}`,
      `Income band:    ${f.incomeBand ?? "—"} MUR/month`,
      `Net worth:      ${f.netWorthBand ?? "—"} MUR`,
      `DSR:            ${dsr}`,
      `Collateral:     ${col}`,
      `LTV:            ${ltv}`,
      ...(markerComment   ? [`\nMarker note:    ${markerComment}`]   : []),
      ...(approverComment ? [`Approver note:  ${approverComment}`] : []),
      `${"─".repeat(48)}`,
      `CONFIDENTIAL — For internal use only. Client identity not disclosed.`,
    ];

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Ficium Request Dossier #${refDisplay}</title>
      <style>body{font-family:'Courier New',monospace;font-size:13px;padding:40px;max-width:680px;margin:0 auto;color:#1a1a2e}.logo{font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#2563eb;margin-bottom:4px}.subtitle{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px;margin-bottom:32px}pre{white-space:pre-wrap;word-break:break-word;background:#f8f7f4;padding:24px;border-radius:8px;border:1px solid #e5e5e0}.footer{margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #e5e5e0;padding-top:12px}@media print{body{padding:20px}}</style>
    </head><body>
      <div class="logo">Ficium</div>
      <div class="subtitle">Request Dossier — Confidential</div>
      <pre>${lines.join("\n")}</pre>
      <div class="footer">This document is for internal use only. Generated by Ficium Institution Portal.</div>
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-3xl shadow-[0_32px_80px_rgba(10,10,26,0.28)] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
           onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-8 py-6 border-b border-ink/[0.07] flex-shrink-0">
          <div>
            <div className="text-[11px] font-bold text-ficium uppercase tracking-widest mb-1">{f.familyLabel ?? "Financial product"}</div>
            <h2 className="font-display font-bold text-[24px] text-ink leading-tight">{f.productLabel}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={downloadPDF} title="Download dossier"
              className="flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ficium border border-ink/10 hover:border-ficium/30 px-3.5 py-2 rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-ink/[0.05] hover:bg-ink/10 grid place-items-center text-muted hover:text-ink transition-colors">
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink/[0.07] flex-shrink-0 px-8">
          {(["details", "chat"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-2 py-3.5 mr-6 text-[13px] font-semibold transition-colors border-b-2 ${
                tab === t ? "border-ficium text-ficium" : "border-transparent text-muted hover:text-ink"
              }`}>
              {t === "details" ? <FileText className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        {tab === "details" ? (
          <div className="flex-1 overflow-y-auto">
            <div className="px-8 py-6 space-y-7">

              {/* Meta row */}
              <div className="grid grid-cols-3 gap-3">
                <DetailStat label="Status"><span className="bg-green-50 text-green-700 border border-green-200 text-[11px] font-semibold px-2.5 py-1 rounded-full">Open</span></DetailStat>
                <DetailStat label="Submitted" value={fmtDate(request.created_at)} />
                <DetailStat label="Ref" value={`#${refDisplay}`} />
                <DetailStat label="Amount" value={fmt(Number(request.amount))} bold />
                {request.term_months && <DetailStat label="Term" value={`${request.term_months} months`} bold />}
                {request.bid_window_closes_at && (
                  <DetailStat label="Bid window closes" value={fmtDate(request.bid_window_closes_at)} accent={isUrgent ? "red" : undefined} />
                )}
              </div>

              {/* Purpose */}
              {f.loanPurpose && (
                <div>
                  <SectionLabel icon={<FileText className="w-3.5 h-3.5" />} text="Purpose" />
                  <p className="text-[14px] text-ink/80 bg-cream rounded-xl px-4 py-3 leading-relaxed">{f.loanPurpose}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                {/* Client Profile */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <SectionLabel icon={<User className="w-3.5 h-3.5" />} text="Client Profile" />
                    <span className="text-[10px] text-muted bg-ink/5 px-2 py-1 rounded-full">Anonymised</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ProfileStat label="KYC"
                      value={f.kycVerified != null ? (f.kycVerified ? "Verified" : "Pending") : "—"}
                      accent={f.kycVerified ? "green" : f.kycVerified === false ? "red" : undefined} />
                    <ProfileStat label="Risk tier"
                      value={f.riskTier ?? "—"}
                      accent={accentTier(f.riskTier)} />
                    <ProfileStat label="Credit score"
                      value={f.healthScore != null ? `${f.healthScore}/100` : "—"}
                      accent={accentScore(f.healthScore)} />
                    <ProfileStat label="Affordability"
                      value={f.affordabilityScore != null ? `${f.affordabilityScore}/100` : "—"}
                      accent={accentScore(f.affordabilityScore)} />
                    <ProfileStat label="Risk score"
                      value={f.riskScore != null ? `${f.riskScore}/100` : "—"} />
                    <ProfileStat label="Employment"
                      value={f.employmentStatus?.replace(/_/g, " ") ?? "—"} />
                    <ProfileStat label="Income band"
                      value={f.incomeBand ? `${f.incomeBand} MUR/mo` : "—"} />
                    <ProfileStat label="Net worth"
                      value={f.netWorthBand ? `${f.netWorthBand} MUR` : "—"} />
                    <ProfileStat label="DSR current"
                      value={f.dsrCurrent != null ? `${f.dsrCurrent}%` : "—"}
                      accent={accentDSR(f.dsrCurrent)} />
                    <ProfileStat label="DSR post-loan"
                      value={f.dsrPost != null ? `${f.dsrPost}%` : "—"}
                      accent={accentDSR(f.dsrPost)} />
                  </div>

                  {/* Collateral / LTV — only for secured products */}
                  {(f.collateralType || f.ltvPct != null) && (
                    <div className="mt-2 pt-2 border-t border-ink/[0.06] grid grid-cols-2 gap-2">
                      <ProfileStat label="Collateral"
                        value={[fmtCollateral(f.collateralType), f.collateralSub].filter(Boolean).join(" / ") || "—"} />
                      <ProfileStat label="LTV"
                        value={f.ltvPct != null ? `${f.ltvPct}%` : "—"}
                        accent={accentLTV(f.ltvPct)} />
                    </div>
                  )}

                  <p className="text-[10px] text-muted mt-2">Client identity not disclosed at this stage.</p>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <div>
                    <SectionLabel icon={<DollarSign className="w-3.5 h-3.5" />} text="Requested Amount" />
                    <div className="bg-cream rounded-xl px-4 py-3">
                      <div className="font-display font-bold text-[24px] text-ink">{fmt(Number(request.amount))}</div>
                      {request.term_months && <div className="text-[13px] text-muted mt-0.5">over {request.term_months} months</div>}
                    </div>
                  </div>
                  <div>
                    <SectionLabel icon={<TrendingUp className="w-3.5 h-3.5" />} text="Rate Guidance" />
                    <div className="bg-cream rounded-xl px-4 py-3 text-[13px] text-ink/70 leading-relaxed">
                      Submit your most competitive rate. Clients compare all bids and are not shown your institution name until they choose to connect.
                    </div>
                  </div>
                </div>
              </div>

              {/* Maker-checker comments */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                {[
                  { label: "Marker Comment",   color: "ficium", value: markerComment,   set: setMarkerComment,   placeholder: "Add your analysis or notes before submitting for approval…" },
                  { label: "Approver Comment", color: "amber",  value: approverComment, set: setApproverComment, placeholder: "Approver review notes — reasons for approval or rejection…" },
                ].map(({ label, color, value, set, placeholder }) => (
                  <div key={label}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-5 h-5 rounded-md bg-${color === "ficium" ? "ficium/10" : "amber-100"} grid place-items-center`}>
                        <MessageSquare className={`w-3 h-3 text-${color === "ficium" ? "ficium" : "amber-600"}`} />
                      </div>
                      <span className={`text-[11px] font-bold text-${color === "ficium" ? "ficium" : "amber-600"} uppercase tracking-wider`}>{label}</span>
                    </div>
                    <textarea value={value} onChange={(e) => set(e.target.value)} rows={4} placeholder={placeholder}
                      className={`w-full bg-white border border-ink/[0.10] focus:border-${color === "ficium" ? "ficium" : "amber-400"} focus:ring-2 focus:ring-${color === "ficium" ? "ficium" : "amber-400"}/15 rounded-2xl px-4 py-3 text-[13px] text-ink placeholder:text-muted/60 outline-none resize-none transition-all`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <RequestChat requestId={request.id} senderType="institution" client={institutionSupabase} />
          </div>
        )}

        {/* Footer CTA */}
        {tab === "details" && (
          <div className="flex-shrink-0 bg-white border-t border-ink/[0.07] px-8 py-5 flex items-center gap-4">
            <button onClick={onBid}
              className="flex-1 flex items-center justify-center gap-2 bg-ficium hover:bg-ficium-deep text-white font-bold py-3.5 rounded-2xl transition-colors text-[15px] shadow-ficium">
              <Zap className="w-5 h-5" /> Place bid on this request
            </button>
            <button onClick={onClose} className="px-6 py-3.5 rounded-2xl border border-ink/10 text-muted text-[14px] font-semibold hover:bg-ink/[0.03] transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
