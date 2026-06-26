const fmtMUR = (v: number) =>
  `MUR ${Number(v).toLocaleString("en-MU", { maximumFractionDigits: 0 })}`;

interface DealSummaryPanelProps {
  amount:     number;
  rate:       number;
  termMonths: number;
}

export function DealSummaryPanel({ amount, rate, termMonths }: DealSummaryPanelProps) {
  const items = [
    { label: "Deal amount", value: fmtMUR(amount) },
    { label: "Rate",        value: `${(rate * 100).toFixed(2)}%` },
    { label: "Term",        value: `${termMonths}m` },
  ];

  return (
    <div className="bg-white border border-ink/[0.07] rounded-2xl p-4 grid grid-cols-3 gap-3">
      {items.map(({ label, value }) => (
        <div key={label}>
          <div className="text-[9px] text-muted uppercase tracking-widest font-bold">{label}</div>
          <div className="font-display font-bold text-[14px] text-ink mt-0.5">{value}</div>
        </div>
      ))}
    </div>
  );
}
