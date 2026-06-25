import { useState }        from "react";
import { X, FileText, MessageSquare, Download, User, DollarSign, TrendingUp, Zap, Briefcase, AlertCircle } from "lucide-react";
import institutionSupabase from "@/institution/lib/institutionSupabase";
import RequestChat         from "@/shared/components/RequestChat";
import type { MarketplaceRequest, LoanRecord } from "@/institution/types/institution";
import { SectionLabel, DetailStat, ProfileStat } from "./MarketplacePrimitives";

interface Props { request: MarketplaceRequest; onClose: () => void; onBid: () => void; }

const fmt     = (v: number) => v >= 1_000_000 ? `MUR ${(v / 1_000_000).toFixed(1)}M` : `MUR ${Number(v).toLocaleString()}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dash    = (v: string | number | null | undefined) => (v != null && v !== "") ? String(v) : "—";

function useFields(r: MarketplaceRequest) {
  const m = r.metadata; const p = r.params;
  const ref = r.consumer_ref ?? r.client_ref;
  return {
    m, p, ref,
    productLabel:  r.product_label ?? r.product_type,
    familyLabel:   r.product_family_label ?? r.family_label,
    loanPurpose:   p?.loan_purpose ?? r.purpose,
    // Scores
    healthScore:        m?.health_score         ?? r.client_health_score,
    affordScore:        m?.affordability_score  ?? r.client_affordability_score,
    riskScore:          m?.risk_score           ?? r.client_risk_score,
    riskTier:           m?.risk_tier,
    kycVerified:        m?.kyc_verified,
    // Employment
    employmentStatus:   m?.employment_status    ?? r.client_employment_status,
    employmentType:     m?.employment_type,
    employer:           m?.employer,
    yearsEmployed:      m?.years_employed,
    grossIncome:        m?.gross_monthly_income ?? r.client_monthly_income,
    // DSR
    dsrCurrent:         m?.dsr_current_pct,
    dsrPost:            m?.dsr_post_pct,
    // Net worth & obligations
    netWorthBand:       m?.net_worth_band,
    existingRepayment:  m?.existing_monthly_repayment,
    existingBalance:    m?.existing_loan_balance,
    loans:              (m?.loan_breakdown ?? []) as LoanRecord[],
    // Collateral
    collateralType:     p?.collateral_type,
    collateralSub:      p?.collateral_sub,
    ltvPct:             p?.ltv_pct,
  };
}

const accentScore = (v?: number | null) => !v ? undefined : v >= 70 ? "green" : v >= 50 ? "amber" : "red";
const accentDSR   = (v?: number | null) => !v ? undefined : v < 40  ? "green" : v < 55  ? "amber" : "red";
const accentTier  = (t?: string | null) => !t ? undefined : t === "A" ? "green" : t === "B" ? "amber" : "red";
const accentLTV   = (v?: number | null) => !v ? undefined : v < 80  ? "green" : v < 90  ? "amber" : "red";
const fmtType     = (s?: string | null) => s ? s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "—";

export function RequestDetailDrawer({ request, onClose, onBid }: Props) {
  const [tab, setTab]                     = useState<"details" | "chat">("details");
  const [markerComment,   setMarkerComment]   = useState("");
  const [approverComment, setApproverComment] = useState("");
  const f   = useFields(request);
  const ref = f.ref?.slice(0, 8) ?? "—";
  const isUrgent = new Date(request.bid_window_closes_at).getTime() - Date.now() < 60 * 60 * 1000;

  const downloadPDF = () => {
    const loanLines = f.loans.length
      ? f.loans.map(l => `  • ${fmtType(l.type)}: ${fmt(l.outstanding)} outstanding | ${fmt(l.monthly)}/mo${l.bank ? ` | ${l.bank}` : ""}`)
      : ["  —"];
    const lines = [
      `FICIUM — REQUEST DOSSIER`,
      `Generated: ${new Date().toLocaleString("en-MU")}`,
      `${"─".repeat(52)}`,
      `Product:              ${f.productLabel}`,
      `Family:               ${f.familyLabel ?? "—"}`,
      `Status:               Open`,
      `Amount:               ${fmt(Number(request.amount))}`,
      `Term:                 ${request.term_months ? `${request.term_months} months` : "—"}`,
      `Submitted:            ${fmtDate(request.created_at)}`,
      `Bid window:           ${fmtDate(request.bid_window_closes_at)}`,
      `Ref:                  #${ref}`,
      ...(f.loanPurpose ? [`Purpose:              ${f.loanPurpose}`] : []),
      `${"─".repeat(52)}`,
      `RISK PROFILE`,
      `KYC status:           ${f.kycVerified ? "Verified" : "—"}`,
      `Risk tier:            ${f.riskTier ?? "—"}`,
      `Credit score:         ${f.healthScore != null ? `${f.healthScore}/100` : "—"}`,
      `Affordability:        ${f.affordScore != null ? `${f.affordScore}/100` : "—"}`,
      `Risk score:           ${f.riskScore != null ? `${f.riskScore}/100` : "—"}`,
      `${"─".repeat(52)}`,
      `EMPLOYMENT`,
      `Employer:             ${f.employer ?? "—"}`,
      `Employment type:      ${fmtType(f.employmentType)}`,
      `Years employed:       ${f.yearsEmployed != null ? `${f.yearsEmployed} yrs` : "—"}`,
      `Gross monthly income: ${f.grossIncome != null ? fmt(f.grossIncome) : "—"}`,
      `Employment status:    ${fmtType(f.employmentStatus)}`,
      `${"─".repeat(52)}`,
      `EXISTING OBLIGATIONS`,
      `Monthly repayment:    ${f.existingRepayment != null ? fmt(f.existingRepayment) : "—"}`,
      `Total loan balance:   ${f.existingBalance != null ? fmt(f.existingBalance) : "—"}`,
      `DSR (current):        ${f.dsrCurrent != null ? `${f.dsrCurrent}%` : "—"}`,
      `DSR (post-loan):      ${f.dsrPost != null ? `${f.dsrPost}%` : "—"}`,
      `Loan breakdown:`,
      ...loanLines,
      ...(f.collateralType && f.collateralType !== "none" ? [
        `${"─".repeat(52)}`,
        `COLLATERAL`,
        `Type:                 ${[fmtType(f.collateralType), f.collateralSub].filter(Boolean).join(" / ")}`,
        `LTV:                  ${f.ltvPct != null ? `${f.ltvPct}%` : "—"}`,
      ] : []),
      ...(markerComment   ? [`\nMarker note:          ${markerComment}`]   : []),
      ...(approverComment ? [`Approver note:        ${approverComment}`] : []),
      `${"─".repeat(52)}`,
      `CONFIDENTIAL — For internal use only. Client identity not disclosed.`,
    ];
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Ficium Request Dossier #${ref}</title>
      <style>body{font-family:'Courier New',monospace;font-size:13px;padding:40px;max-width:740px;margin:0 auto;color:#1a1a2e}.logo{font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#2563eb;margin-bottom:4px}.subtitle{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px;margin-bottom:32px}pre{white-space:pre-wrap;word-break:break-word;background:#f8f7f4;padding:24px;border-radius:8px;border:1px solid #e5e5e0}.footer{margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #e5e5e0;padding-top:12px}@media print{body{padding:20px}}</style>
    </head><body>
      <div class="logo">Ficium</div>
      <div class="subtitle">Request Dossier — Confidential</div>
      <pre>${lines.join("\n")}</pre>
      <div class="footer">For internal use only. Generated by Ficium Institution Portal.</div>
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-3xl shadow-[0_32px_80px_rgba(10,10,26,0.28)] w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-8 py-5 border-b border-ink/[0.07] flex-shrink-0">
          <div>
            <div className="text-[11px] font-bold text-ficium uppercase tracking-widest mb-1">{f.familyLabel ?? "Financial product"}</div>
            <h2 className="font-display font-bold text-[24px] text-ink leading-tight">{f.productLabel}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={downloadPDF} className="flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-ficium border border-ink/10 hover:border-ficium/30 px-3.5 py-2 rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-ink/[0.05] hover:bg-ink/10 grid place-items-center text-muted hover:text-ink transition-colors">
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink/[0.07] flex-shrink-0 px-8">
          {(["details", "chat"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-2 py-3.5 mr-6 text-[13px] font-semibold transition-colors border-b-2 ${tab === t ? "border-ficium text-ficium" : "border-transparent text-muted hover:text-ink"}`}>
              {t === "details" ? <FileText className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "details" ? (
          <div className="flex-1 overflow-y-auto">
            <div className="px-8 py-6 space-y-6">

              {/* Meta row */}
              <div className="grid grid-cols-3 gap-3">
                <DetailStat label="Status"><span className="bg-green-50 text-green-700 border border-green-200 text-[11px] font-semibold px-2.5 py-1 rounded-full">Open</span></DetailStat>
                <DetailStat label="Submitted" value={fmtDate(request.created_at)} />
                <DetailStat label="Ref" value={`#${ref}`} />
                <DetailStat label="Amount" value={fmt(Number(request.amount))} bold />
                {request.term_months && <DetailStat label="Term" value={`${request.term_months} months`} bold />}
                {request.bid_window_closes_at && <DetailStat label="Bid window closes" value={fmtDate(request.bid_window_closes_at)} accent={isUrgent ? "red" : undefined} />}
              </div>

              {/* Purpose */}
              {f.loanPurpose && (
                <div>
                  <SectionLabel icon={<FileText className="w-3.5 h-3.5" />} text="Purpose" />
                  <p className="text-[14px] text-ink/80 bg-cream rounded-xl px-4 py-3 leading-relaxed">{f.loanPurpose}</p>
                </div>
              )}

              {/* Main 3-column layout */}
              <div className="grid grid-cols-3 gap-5">

                {/* LEFT: Risk profile */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionLabel icon={<User className="w-3.5 h-3.5" />} text="Risk Profile" />
                    <span className="text-[10px] text-muted bg-ink/5 px-2 py-1 rounded-full">Anonymised</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ProfileStat label="KYC"
                      value={f.kycVerified != null ? (f.kycVerified ? "Verified" : "Pending") : "—"}
                      accent={f.kycVerified ? "green" : f.kycVerified === false ? "red" : undefined} />
                    <ProfileStat label="Risk tier" value={dash(f.riskTier)} accent={accentTier(f.riskTier)} />
                    <ProfileStat label="Credit score"
                      value={f.healthScore != null ? `${f.healthScore}/100` : "—"}
                      accent={accentScore(f.healthScore)} />
                    <ProfileStat label="Affordability"
                      value={f.affordScore != null ? `${f.affordScore}/100` : "—"}
                      accent={accentScore(f.affordScore)} />
                    <ProfileStat label="Risk score" value={f.riskScore != null ? `${f.riskScore}/100` : "—"} />
                    <ProfileStat label="Net worth" value={f.netWorthBand ? `${f.netWorthBand} MUR` : "—"} />
                    <ProfileStat label="DSR current"
                      value={f.dsrCurrent != null ? `${f.dsrCurrent}%` : "—"}
                      accent={accentDSR(f.dsrCurrent)} />
                    <ProfileStat label="DSR post-loan"
                      value={f.dsrPost != null ? `${f.dsrPost}%` : "—"}
                      accent={accentDSR(f.dsrPost)} />
                  </div>
                  {(f.collateralType && f.collateralType !== "none") && (
                    <div className="pt-2 border-t border-ink/[0.06] grid grid-cols-2 gap-2">
                      <ProfileStat label="Collateral"
                        value={[fmtType(f.collateralType), f.collateralSub].filter(Boolean).join(" / ") || "—"} />
                      <ProfileStat label="LTV" value={f.ltvPct != null ? `${f.ltvPct}%` : "—"} accent={accentLTV(f.ltvPct)} />
                    </div>
                  )}
                  <p className="text-[10px] text-muted">Client identity not disclosed at this stage.</p>
                </div>

                {/* CENTRE: Employment */}
                <div className="space-y-4">
                  <SectionLabel icon={<Briefcase className="w-3.5 h-3.5" />} text="Employment" />
                  <div className="grid grid-cols-1 gap-2">
                    <ProfileStat label="Employer" value={dash(f.employer)} />
                    <ProfileStat label="Employment type" value={fmtType(f.employmentType)} />
                    <ProfileStat label="Employment status" value={fmtType(f.employmentStatus)} />
                    <ProfileStat label="Years in current role"
                      value={f.yearsEmployed != null ? `${f.yearsEmployed} yrs` : "—"}
                      accent={f.yearsEmployed != null ? (f.yearsEmployed >= 3 ? "green" : f.yearsEmployed >= 1 ? "amber" : "red") : undefined} />
                    <ProfileStat label="Gross monthly income"
                      value={f.grossIncome != null ? fmt(f.grossIncome) : "—"} />
                  </div>
                </div>

                {/* RIGHT: Requested amount + rate guidance */}
                <div className="space-y-4">
                  <div>
                    <SectionLabel icon={<DollarSign className="w-3.5 h-3.5" />} text="Requested Amount" />
                    <div className="bg-cream rounded-xl px-4 py-3">
                      <div className="font-display font-bold text-[26px] text-ink">{fmt(Number(request.amount))}</div>
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

              {/* Existing obligations — full width */}
              <div>
                <SectionLabel icon={<AlertCircle className="w-3.5 h-3.5" />} text="Existing Obligations" />
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <ProfileStat label="Monthly repayment" value={f.existingRepayment != null ? fmt(f.existingRepayment) : "—"} />
                  <ProfileStat label="Total outstanding balance" value={f.existingBalance != null ? fmt(f.existingBalance) : "—"} />
                  <ProfileStat label="Number of existing loans" value={f.loans.length > 0 ? `${f.loans.length}` : f.loans.length === 0 && f.existingBalance ? "1+" : "—"} />
                </div>
                {f.loans.length > 0 && (
                  <div className="rounded-xl overflow-hidden border border-ink/[0.08]">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-ink/[0.03] border-b border-ink/[0.06]">
                          <th className="text-left px-4 py-2.5 font-semibold text-muted uppercase tracking-wide text-[10px]">Type</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-muted uppercase tracking-wide text-[10px]">Outstanding</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-muted uppercase tracking-wide text-[10px]">Monthly</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-muted uppercase tracking-wide text-[10px]">Bank</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-muted uppercase tracking-wide text-[10px]">Months left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.loans.map((loan, i) => (
                          <tr key={i} className="border-b border-ink/[0.04] last:border-0 hover:bg-ink/[0.01]">
                            <td className="px-4 py-2.5 font-medium text-ink">{fmtType(loan.type)}</td>
                            <td className="px-4 py-2.5 text-right text-ink">{fmt(loan.outstanding)}</td>
                            <td className="px-4 py-2.5 text-right text-ink">{fmt(loan.monthly)}</td>
                            <td className="px-4 py-2.5 text-muted">{loan.bank ?? "—"}</td>
                            <td className="px-4 py-2.5 text-right text-muted">{loan.months_left ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Maker-checker comments */}
              <div className="grid grid-cols-2 gap-4 pt-1">
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
                    <textarea value={value} onChange={e => set(e.target.value)} rows={3} placeholder={placeholder}
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
