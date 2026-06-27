import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatMUR,
  formatProductType,
  formatRate,
  formatAmount,
  formatDistanceToNow,
  shortId,
} from "./format";

describe("formatMUR", () => {
  it("prefixes Rs and groups thousands", () => {
    expect(formatMUR(250000)).toBe("Rs 250,000");
  });
  it("handles zero", () => {
    expect(formatMUR(0)).toBe("Rs 0");
  });
});

describe("formatProductType", () => {
  it("maps known snake_case keys to friendly labels", () => {
    expect(formatProductType("personal_loan")).toBe("Personal Loan");
    expect(formatProductType("fixed_deposit")).toBe("Fixed Deposit");
    expect(formatProductType("mortgage")).toBe("Mortgage");
  });
  it("title-cases unknown keys as a fallback", () => {
    expect(formatProductType("green_energy_loan")).toBe("Green Energy Loan");
  });
});

describe("formatRate", () => {
  it("converts a decimal fraction to a 2dp percentage", () => {
    expect(formatRate(0.0875)).toBe("8.75%");
    expect(formatRate(0.05)).toBe("5.00%");
  });
  it("returns an em-dash for null/undefined", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
  });
  it("handles zero rate", () => {
    expect(formatRate(0)).toBe("0.00%");
  });
});

describe("formatAmount", () => {
  it("prefixes the currency and groups thousands", () => {
    expect(formatAmount(5000)).toBe("MUR 5,000");
  });
  it("respects a custom currency", () => {
    expect(formatAmount(5000, "USD")).toBe("USD 5,000");
  });
  it("returns an em-dash for null/undefined", () => {
    expect(formatAmount(null)).toBe("—");
    expect(formatAmount(undefined)).toBe("—");
  });
});

describe("formatDistanceToNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for sub-minute differences", () => {
    expect(formatDistanceToNow("2026-06-27T11:59:30Z")).toBe("just now");
  });
  it("formats minutes in the past with 'ago'", () => {
    expect(formatDistanceToNow("2026-06-27T11:30:00Z")).toBe("30m ago");
  });
  it("formats hours in the past with 'ago'", () => {
    expect(formatDistanceToNow("2026-06-27T09:00:00Z")).toBe("3h ago");
  });
  it("formats days in the past with 'ago'", () => {
    expect(formatDistanceToNow("2026-06-25T12:00:00Z")).toBe("2d ago");
  });
  it("formats future times with 'in' prefix", () => {
    expect(formatDistanceToNow("2026-06-27T14:00:00Z")).toBe("in 2h");
    expect(formatDistanceToNow("2026-06-29T12:00:00Z")).toBe("in 2d");
  });
});

describe("shortId", () => {
  it("truncates a UUID to its first 8 chars with an ellipsis", () => {
    expect(shortId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("a1b2c3d4…");
  });
});
