// =============================================================
// Ficium — Shared formatting utilities
// Single source of truth for all display-formatting helpers.
// Previously duplicated across:
//   - src/individual/dashboard/api/profile.ts
//   - src/individual/dashboard/components/profile/ProfileComponents.tsx
//   - src/individual/onboarding/components/dossier/DossierShared.tsx
//   - src/individual/requests/api/requests.ts
//   - src/institution/lib/utils.ts
// =============================================================

/**
 * Format a Mauritian Rupee amount.
 * e.g. 250000 → "Rs 250,000"
 */
export function formatMUR(amount: number): string {
  return `Rs ${Number(amount).toLocaleString("en-MU")}`;
}

/**
 * Map a snake_case product type key to a human-readable label.
 * e.g. "personal_loan" → "Personal Loan"
 */
export function formatProductType(t: string): string {
  const map: Record<string, string> = {
    personal_loan:   "Personal Loan",
    business_loan:   "Business Loan",
    mortgage:        "Mortgage",
    vehicle_loan:    "Vehicle Loan",
    credit_card:     "Credit Card",
    fixed_deposit:   "Fixed Deposit",
    savings_account: "Savings Account",
    investment:      "Investment",
    insurance:       "Insurance",
    other:           "Other",
  };
  return map[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a rate (0.0875) to a percentage string "8.75%"
 */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return (rate * 100).toFixed(2) + "%";
}

/**
 * Format a generic currency amount.
 * e.g. formatAmount(5000) → "MUR 5,000"
 */
export function formatAmount(amount: number | null | undefined, currency = "MUR"): string {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toLocaleString("en-MU")}`;
}

/**
 * Return a human-readable relative time string.
 * e.g. "3h ago", "in 2d"
 */
export function formatDistanceToNow(dateStr: string): string {
  const date    = new Date(dateStr);
  const now     = new Date();
  const diff    = date.getTime() - now.getTime();
  const abs     = Math.abs(diff);
  const past    = diff < 0;
  const minutes = Math.floor(abs / 60_000);
  const hours   = Math.floor(abs / 3_600_000);
  const days    = Math.floor(abs / 86_400_000);

  let label: string;
  if (minutes < 1)   label = "just now";
  else if (minutes < 60) label = `${minutes}m`;
  else if (hours < 24)   label = `${hours}h`;
  else                   label = `${days}d`;

  if (label === "just now") return label;
  return past ? `${label} ago` : `in ${label}`;
}

/**
 * Truncate a UUID for display.
 * e.g. "a1b2c3d4-..." → "a1b2c3d4…"
 */
export function shortId(id: string): string {
  return id.slice(0, 8) + "…";
}
