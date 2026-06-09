// ── Shared display primitives for the Institution Marketplace ────────────────

export function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-ficium">{icon}</span>
      <span className="text-[11px] font-bold text-ficium uppercase tracking-wider">{text}</span>
    </div>
  );
}

export function DetailStat({ label, value, children, bold, accent }: {
  label: string; value?: string; children?: React.ReactNode; bold?: boolean;
  accent?: "red" | "amber" | "green";
}) {
  const accentCls = accent === "red" ? "text-red-500" : accent === "amber" ? "text-amber-600" : accent === "green" ? "text-green-600" : "";
  return (
    <div className="bg-cream rounded-xl px-3 py-2.5">
      <div className="text-[10px] text-muted mb-0.5">{label}</div>
      {children ?? (
        <div className={`text-[13px] ${bold ? "font-bold text-ink" : `font-medium text-ink/80 ${accentCls}`}`}>{value}</div>
      )}
    </div>
  );
}

export function ProfileStat({ label, value, accent }: { label: string; value: string; accent?: "green" | "amber" | "red" }) {
  const cls = accent === "green" ? "text-green-600 font-bold" : accent === "amber" ? "text-amber-600 font-bold" : accent === "red" ? "text-red-500 font-bold" : "font-bold text-ink";
  return (
    <div className="bg-white rounded-xl p-2.5 border border-ink/[0.06]">
      <div className="text-[10px] text-muted mb-0.5">{label}</div>
      <div className={`text-[13px] ${cls} capitalize`}>{value}</div>
    </div>
  );
}
