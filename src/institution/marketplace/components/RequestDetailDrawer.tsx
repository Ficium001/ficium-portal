import { useState }        from "react";
import { X, FileText, MessageSquare, Download, User, DollarSign, TrendingUp, Zap, Briefcase, AlertCircle } from "lucide-react";
import institutionSupabase from "@/institution/lib/institutionSupabase";
import RequestChat         from "@/shared/components/RequestChat";
import type { MarketplaceRequest, LoanRecord } from "@/institution/types/institution";
import { SectionLabel, DetailStat, ProfileStat } from "./MarketplacePrimitives";

interface Props {
  request: MarketplaceRequest;
  onClose: () => void;
  onBid: () => void;
  onReject: (reason: string) => void;
  isRejecting?: boolean;
  rejectError?: string;
}

const fmt     = (v: number) => v >= 1_000_000 ? `MUR ${(v / 1_000_000).toFixed(1)}M` : `MUR ${Number(v).toLocaleString()}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-MU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dash    = (v: string | number | null | undefined) => (v != null && v !== "") ? String(v) : "—";
const fmtType = (s?: string | null) => s ? s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "—";

function useFields(r: MarketplaceRequest) {
  const m = r.metadata; const p = r.params;
  return {
    m, p,
    ref:              (r.consumer_ref ?? r.client_ref)?.slice(0, 8) ?? "—",
    productLabel:     r.product_label ?? r.product_type,
    familyLabel:      r.product_family_label ?? r.family_label,
    loanPurpose:      p?.loan_purpose ?? r.purpose,
    healthScore:      m?.health_score       ?? r.client_health_score,
    affordScore:      m?.affordability_score ?? r.client_affordability_score,
    riskScore:        m?.risk_score         ?? r.client_risk_score,
    riskTier:         m?.risk_tier,
    kycVerified:      m?.kyc_verified,
    age:              m?.age,
    employmentStatus: m?.employment_status  ?? r.client_employment_status,
    employmentType:   m?.employment_type,
    employer:         m?.employer,
    yearsEmployed:    m?.years_employed,
    grossIncome:      m?.gross_monthly_income ?? r.client_monthly_income,
    dsrCurrent:       m?.dsr_current_pct,
    dsrPost:          m?.dsr_post_pct,
    netWorthBand:     m?.net_worth_band,
    existingRepayment:m?.existing_monthly_repayment,
    existingBalance:  m?.existing_loan_balance,
    loans:            (m?.loan_breakdown ?? []) as LoanRecord[],
    collateralType:   p?.collateral_type,
    collateralSub:    p?.collateral_sub,
    ltvPct:           p?.ltv_pct,
  };
}

const accentScore = (v?: number | null) => !v ? undefined : v >= 70 ? "green" : v >= 50 ? "amber" : "red";
const accentDSR   = (v?: number | null) => !v ? undefined : v < 40 ? "green" : v < 55 ? "amber" : "red";
const accentTier  = (t?: string | null) => !t ? undefined : t === "A" ? "green" : t === "B" ? "amber" : "red";
const accentLTV   = (v?: number | null) => !v ? undefined : v < 80 ? "green" : v < 90 ? "amber" : "red";
const accentYears = (v?: number | null) => !v ? undefined : v >= 3 ? "green" : v >= 1 ? "amber" : "red";

// ── PDF Report Generator ──────────────────────────────────────────────────────
function buildPDFHtml(f: ReturnType<typeof useFields>, request: MarketplaceRequest, markerNote: string, approverNote: string): string {
  const genDate = new Date().toLocaleString("en-MU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const c = {
    purple: "#4F46E5", purpleDark: "#3730A3", purpleLight: "#EEF2FF",
    green: "#059669", greenBg: "#D1FAE5", greenText: "#065F46",
    amber: "#D97706", amberBg: "#FEF3C7", amberText: "#92400E",
    red: "#DC2626",   redBg: "#FEE2E2",   redText: "#991B1B",
    ink: "#1a1a2e", muted: "#6b7280", cream: "#f8f7f4", border: "#e5e3de",
  };

  const scoreColor  = (v?: number | null) => !v ? c.muted : v >= 70 ? c.green : v >= 50 ? c.amber : c.red;
  const dsrColor    = (v?: number | null) => !v ? c.muted : v < 40 ? c.green : v < 55 ? c.amber : c.red;
  const tierColor   = (t?: string | null) => !t ? c.muted : t === "A" ? c.green : t === "B" ? c.amber : c.red;
  const tierBg      = (t?: string | null) => !t ? "#f0f0f0" : t === "A" ? c.greenBg : t === "B" ? c.amberBg : c.redBg;
  const yearsColor  = (v?: number | null) => !v ? c.muted : v >= 3 ? c.green : v >= 1 ? c.amber : c.red;
  const ltvColor    = (v?: number | null) => !v ? c.muted : v < 80 ? c.green : v < 90 ? c.amber : c.red;

  const statCard = (label: string, value: string, color?: string, span?: number, big?: boolean) =>
    `<div style="background:${c.cream};border-radius:10px;padding:12px 14px;${span ? `grid-column:span ${span};` : ""}">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${c.muted};margin-bottom:4px;">${label}</div>
      <div style="font-size:${big ? "20px" : "14px"};font-weight:700;color:${color ?? c.ink};">${value}</div>
    </div>`;

  const badge = (text: string, bg: string, col: string) =>
    `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${col};">${text}</span>`;

  const kycBadge = f.kycVerified
    ? badge("Verified", c.greenBg, c.greenText)
    : badge("Pending", c.amberBg, c.amberText);

  const tierBadge = f.riskTier
    ? `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:800;background:${tierBg(f.riskTier)};color:${tierColor(f.riskTier)};">${f.riskTier}</span>`
    : "—";

  const section = (title: string, body: string) =>
    `<div style="margin-bottom:28px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid ${c.border};">
        <div style="width:4px;height:18px;background:${c.purple};border-radius:2px;"></div>
        <h3 style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c.purple};margin:0;">${title}</h3>
      </div>
      ${body}
    </div>`;

  const grid = (cols: number, cards: string) =>
    `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;">${cards}</div>`;

  const loanTableHtml = f.loans.length > 0 ? `
    <div style="border:1px solid ${c.border};border-radius:10px;overflow:hidden;margin-top:12px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:${c.cream};">
            <th style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${c.muted};padding:10px 14px;text-align:left;">Type</th>
            <th style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${c.muted};padding:10px 14px;text-align:right;">Outstanding</th>
            <th style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${c.muted};padding:10px 14px;text-align:right;">Monthly</th>
            <th style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${c.muted};padding:10px 14px;text-align:left;">Bank</th>
            <th style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${c.muted};padding:10px 14px;text-align:right;">Months left</th>
          </tr>
        </thead>
        <tbody>
          ${f.loans.map((l, i) => `
            <tr style="border-top:1px solid ${c.border};${i % 2 === 1 ? `background:${c.cream}` : ""};">
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:${c.ink};">${fmtType(l.type)}</td>
              <td style="padding:10px 14px;font-size:13px;color:${c.ink};text-align:right;">${fmt(l.outstanding)}</td>
              <td style="padding:10px 14px;font-size:13px;color:${c.ink};text-align:right;">${fmt(l.monthly)}</td>
              <td style="padding:10px 14px;font-size:13px;color:${c.muted};">${l.bank ?? "—"}</td>
              <td style="padding:10px 14px;font-size:13px;color:${c.muted};text-align:right;">${l.months_left ?? "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  const notesHtml = (markerNote || approverNote) ? section("Internal Notes", `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div style="background:${c.purpleLight};border-radius:10px;padding:14px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${c.purple};margin-bottom:6px;">Marker</div>
        <div style="font-size:13px;color:${c.ink};">${markerNote || "—"}</div>
      </div>
      <div style="background:${c.amberBg};border-radius:10px;padding:14px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${c.amber};margin-bottom:6px;">Approver</div>
        <div style="font-size:13px;color:${c.ink};">${approverNote || "—"}</div>
      </div>
    </div>`) : "";

  const collateralHtml = (f.collateralType && f.collateralType !== "none") ? section("Collateral", grid(2,
    statCard("Type", [fmtType(f.collateralType), f.collateralSub].filter(Boolean).join(" / ") || "—") +
    statCard("LTV", f.ltvPct != null ? `${f.ltvPct}%` : "—", ltvColor(f.ltvPct))
  )) : "";

  const purposeHtml = f.loanPurpose
    ? `<div style="background:${c.purpleLight};border-left:4px solid ${c.purple};border-radius:6px;padding:12px 16px;margin-bottom:24px;font-size:14px;color:${c.ink};">
        <strong style="color:${c.purple};">Purpose: </strong>${f.loanPurpose}
      </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ficium · Request Dossier #${f.ref}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:${c.ink}; background:#fff; }
    @media print {
      .no-print { display:none !important; }
      body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="background:linear-gradient(135deg,${c.purpleDark} 0%,${c.purple} 100%);color:white;padding:32px 48px 28px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:30px;font-weight:900;letter-spacing:-1px;margin-bottom:2px;">Ficium</div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;opacity:0.75;">Request Dossier · Confidential</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;opacity:0.75;margin-bottom:2px;">Generated ${genDate}</div>
        <div style="font-size:14px;font-weight:700;">Ref #${f.ref}</div>
      </div>
    </div>
    <!-- Summary strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:24px;border-top:1px solid rgba(255,255,255,0.2);padding-top:20px;">
      ${[
        ["Product", f.productLabel],
        ["Amount", fmt(Number(request.amount))],
        ["Term", request.term_months ? `${request.term_months} months` : "—"],
        ["Bid Window Closes", fmtDate(request.bid_window_closes_at)],
      ].map(([label, value]) => `
        <div style="padding-right:20px;">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:1.5px;opacity:0.65;margin-bottom:4px;">${label}</div>
          <div style="font-size:14px;font-weight:700;">${value}</div>
        </div>`).join("")}
    </div>
  </div>

  <!-- Body -->
  <div style="padding:32px 48px;max-width:900px;margin:0 auto;">

    ${purposeHtml}

    <!-- Risk Profile -->
    ${section("Risk Profile", `
      ${grid(4,
        `<div style="background:${c.cream};border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${c.muted};margin-bottom:6px;">KYC Status</div>
          ${kycBadge}
        </div>` +
        `<div style="background:${c.cream};border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${c.muted};margin-bottom:6px;">Risk Tier</div>
          ${tierBadge}
        </div>` +
        statCard("Age", f.age != null ? `${f.age} yrs` : "—") +
        statCard("Net Worth", f.netWorthBand ? `${f.netWorthBand} MUR` : "—")
      )}
      <div style="height:10px;"></div>
      ${grid(4,
        statCard("Credit Score", f.healthScore != null ? `${f.healthScore}/100` : "—", scoreColor(f.healthScore)) +
        statCard("Affordability", f.affordScore != null ? `${f.affordScore}/100` : "—", scoreColor(f.affordScore)) +
        statCard("DSR Current", f.dsrCurrent != null ? `${f.dsrCurrent}%` : "—", dsrColor(f.dsrCurrent)) +
        statCard("DSR Post-Loan", f.dsrPost != null ? `${f.dsrPost}%` : "—", dsrColor(f.dsrPost))
      )}
      <div style="margin-top:8px;font-size:10px;color:${c.muted};">Client identity not disclosed at this stage.</div>
    `)}

    <!-- Employment -->
    ${section("Employment", grid(4,
      statCard("Employer",         dash(f.employer)) +
      statCard("Employment Type",  fmtType(f.employmentType)) +
      statCard("Status",           fmtType(f.employmentStatus)) +
      statCard("Years in Role",    f.yearsEmployed != null ? `${f.yearsEmployed} yrs` : "—", yearsColor(f.yearsEmployed)) +
      statCard("Gross Monthly Income", f.grossIncome != null ? fmt(f.grossIncome) : "—", c.ink, 4, true)
    ))}

    <!-- Existing Obligations -->
    ${section("Existing Obligations", `
      ${grid(3,
        statCard("Monthly Repayment",    f.existingRepayment != null ? fmt(f.existingRepayment) : "—") +
        statCard("Total Outstanding",    f.existingBalance != null ? fmt(f.existingBalance) : "—") +
        statCard("Number of Loans",      f.loans.length > 0 ? `${f.loans.length}` : "—")
      )}
      ${loanTableHtml}
    `)}

    ${collateralHtml}
    ${notesHtml}

    <!-- Footer -->
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid ${c.border};display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c.muted};">Confidential · For internal use only · Client identity not disclosed</div>
      <div style="font-size:11px;color:${c.muted};">Generated by Ficium Institution Portal</div>
    </div>
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function RequestDetailDrawer({ request, onClose, onBid, onReject, isRejecting, rejectError }: Props) {
  const [tab,             setTab]             = useState<"details" | "chat">("details");
  const [markerComment,   setMarkerComment]   = useState("");
  const [approverComment, setApproverComment] = useState("");
  const [showDecline,     setShowDecline]     = useState(false);
  const [declineReason,   setDeclineReason]   = useState("");
  const f        = useFields(request);
  const isUrgent = new Date(request.bid_window_closes_at).getTime() - Date.now() < 60 * 60 * 1000;

  const downloadPDF = () => {
    const html = buildPDFHtml(f, request, markerComment, approverComment);
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 15000);
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

              {/* Meta */}
              <div className="grid grid-cols-3 gap-3">
                <DetailStat label="Status"><span className="bg-green-50 text-green-700 border border-green-200 text-[11px] font-semibold px-2.5 py-1 rounded-full">Open</span></DetailStat>
                <DetailStat label="Submitted" value={fmtDate(request.created_at)} />
                <DetailStat label="Ref" value={`#${f.ref}`} />
                <DetailStat label="Amount" value={fmt(Number(request.amount))} bold />
                {request.term_months && <DetailStat label="Term" value={`${request.term_months} months`} bold />}
                {request.bid_window_closes_at && <DetailStat label="Bid window closes" value={fmtDate(request.bid_window_closes_at)} accent={isUrgent ? "red" : undefined} />}
              </div>

              {/* Purpose */}
              {f.loanPurpose && (
                <div>
                  <SectionLabel icon={<FileText className="w-3.5 h-3.5" />} text="Purpose" />
                  <p className="text-[14px] text-ink/80 bg-cream rounded-xl px-4 py-3">{f.loanPurpose}</p>
                </div>
              )}

              {/* 3-col main */}
              <div className="grid grid-cols-3 gap-5">
                {/* Risk Profile */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <SectionLabel icon={<User className="w-3.5 h-3.5" />} text="Risk Profile" />
                    <span className="text-[10px] text-muted bg-ink/5 px-2 py-1 rounded-full">Anonymised</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ProfileStat label="KYC" value={f.kycVerified != null ? (f.kycVerified ? "Verified" : "Pending") : "—"} accent={f.kycVerified ? "green" : f.kycVerified === false ? "red" : undefined} />
                    <ProfileStat label="Risk tier" value={dash(f.riskTier)} accent={accentTier(f.riskTier)} />
                    <ProfileStat label="Age" value={f.age != null ? `${f.age} yrs` : "—"} />
                    <ProfileStat label="Net worth" value={f.netWorthBand ? `${f.netWorthBand} MUR` : "—"} />
                    <ProfileStat label="Credit score" value={f.healthScore != null ? `${f.healthScore}/100` : "—"} accent={accentScore(f.healthScore)} />
                    <ProfileStat label="Affordability" value={f.affordScore != null ? `${f.affordScore}/100` : "—"} accent={accentScore(f.affordScore)} />
                    <ProfileStat label="DSR current" value={f.dsrCurrent != null ? `${f.dsrCurrent}%` : "—"} accent={accentDSR(f.dsrCurrent)} />
                    <ProfileStat label="DSR post-loan" value={f.dsrPost != null ? `${f.dsrPost}%` : "—"} accent={accentDSR(f.dsrPost)} />
                  </div>
                  {(f.collateralType && f.collateralType !== "none") && (
                    <div className="pt-2 border-t border-ink/[0.06] grid grid-cols-2 gap-2">
                      <ProfileStat label="Collateral" value={[fmtType(f.collateralType), f.collateralSub].filter(Boolean).join(" / ") || "—"} />
                      <ProfileStat label="LTV" value={f.ltvPct != null ? `${f.ltvPct}%` : "—"} accent={accentLTV(f.ltvPct)} />
                    </div>
                  )}
                  <p className="text-[10px] text-muted">Client identity not disclosed at this stage.</p>
                </div>

                {/* Employment */}
                <div className="space-y-3">
                  <SectionLabel icon={<Briefcase className="w-3.5 h-3.5" />} text="Employment" />
                  <div className="grid grid-cols-1 gap-2">
                    <ProfileStat label="Employer"            value={dash(f.employer)} />
                    <ProfileStat label="Employment type"     value={fmtType(f.employmentType)} />
                    <ProfileStat label="Status"              value={fmtType(f.employmentStatus)} />
                    <ProfileStat label="Years in current role" value={f.yearsEmployed != null ? `${f.yearsEmployed} yrs` : "—"} accent={accentYears(f.yearsEmployed)} />
                    <ProfileStat label="Gross monthly income" value={f.grossIncome != null ? fmt(f.grossIncome) : "—"} />
                  </div>
                </div>

                {/* Requested + Rate Guidance */}
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

              {/* Existing Obligations */}
              <div>
                <SectionLabel icon={<AlertCircle className="w-3.5 h-3.5" />} text="Existing Obligations" />
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <ProfileStat label="Monthly repayment"       value={f.existingRepayment != null ? fmt(f.existingRepayment) : "—"} />
                  <ProfileStat label="Total outstanding balance" value={f.existingBalance != null ? fmt(f.existingBalance) : "—"} />
                  <ProfileStat label="Number of existing loans" value={f.loans.length > 0 ? `${f.loans.length}` : "—"} />
                </div>
                {f.loans.length > 0 && (
                  <div className="rounded-xl overflow-hidden border border-ink/[0.08]">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-ink/[0.03] border-b border-ink/[0.06]">
                          {["Type","Outstanding","Monthly","Bank","Months left"].map((h, i) => (
                            <th key={h} className={`py-2.5 px-4 font-bold text-muted uppercase tracking-wide text-[10px] ${i > 0 ? "text-right" : "text-left"} last:text-right`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {f.loans.map((loan, i) => (
                          <tr key={i} className="border-b border-ink/[0.04] last:border-0">
                            <td className="px-4 py-2.5 font-semibold text-ink">{fmtType(loan.type)}</td>
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

              {/* Comments */}
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

        {/* Footer */}
        {tab === "details" && (
          <div className="flex-shrink-0 bg-white border-t border-ink/[0.07] px-8 py-5">
            {showDecline ? (
              <div>
                <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
                  Reason for declining (shown to Ficium, not the borrower)
                </label>
                <textarea
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Outside current risk appetite for this product/tenor"
                  className="w-full bg-white border border-ink/[0.10] focus:border-red-400 focus:ring-2 focus:ring-red-400/15 rounded-2xl px-4 py-3 text-[13px] text-ink placeholder:text-muted/60 outline-none resize-none transition-all mb-3"
                />
                {rejectError && (
                  <div className="flex items-center gap-2 text-[13px] text-red-600 mb-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {rejectError}
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => onReject(declineReason.trim())}
                    disabled={isRejecting}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl transition-colors text-[15px]"
                  >
                    {isRejecting ? "Declining…" : "Confirm decline"}
                  </button>
                  <button
                    onClick={() => setShowDecline(false)}
                    disabled={isRejecting}
                    className="px-6 py-3.5 rounded-2xl border border-ink/10 text-muted text-[14px] font-semibold hover:bg-ink/[0.03] transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button onClick={onBid} className="flex-1 flex items-center justify-center gap-2 bg-ficium hover:bg-ficium-deep text-white font-bold py-3.5 rounded-2xl transition-colors text-[15px] shadow-ficium">
                  <Zap className="w-5 h-5" /> Place bid on this request
                </button>
                <button onClick={() => setShowDecline(true)} className="px-6 py-3.5 rounded-2xl border border-red-200 text-red-600 text-[14px] font-semibold hover:bg-red-50 transition-colors">
                  Decline
                </button>
                <button onClick={onClose} className="px-6 py-3.5 rounded-2xl border border-ink/10 text-muted text-[14px] font-semibold hover:bg-ink/[0.03] transition-colors">
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
