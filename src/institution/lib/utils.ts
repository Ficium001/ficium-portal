// =============================================================
// Ficium — Institution Portal Utils
// Re-exports shared formatting helpers. Previously had local
// duplicates of formatDistanceToNow, formatRate, formatAmount,
// shortId — all consolidated in src/shared/lib/format.ts.
// =============================================================
export {
  formatDistanceToNow,
  formatRate,
  formatAmount,
  shortId,
} from "@/shared/lib/format";
