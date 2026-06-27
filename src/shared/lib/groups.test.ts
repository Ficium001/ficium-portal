import { describe, it, expect } from "vitest";
import { resolvePermissions } from "./groups";

describe("resolvePermissions", () => {
  const allKeys = ["inst:dashboard", "inst:marketplace", "inst:bids"];

  it("expands a wildcard to the full key list", () => {
    expect(resolvePermissions(["*"], allKeys)).toEqual(allKeys);
  });

  it("returns the explicit list unchanged when no wildcard is present", () => {
    const perms = ["inst:dashboard", "inst:bids"];
    expect(resolvePermissions(perms, allKeys)).toEqual(perms);
  });

  it("returns an empty list for empty permissions", () => {
    expect(resolvePermissions([], allKeys)).toEqual([]);
  });

  it("a wildcard takes precedence even when mixed with explicit keys", () => {
    expect(resolvePermissions(["inst:dashboard", "*"], allKeys)).toEqual(allKeys);
  });
});
