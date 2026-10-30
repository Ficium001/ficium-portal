import { describe, it, expect } from "vitest";
import {
  allowedModules,
  MODULE_CATALOGUE,
  MODULE_BY_KEY,
  INSTITUTION_MODULE_LIST,
  ADMIN_MODULE_LIST,
} from "./modules";

describe("allowedModules — access control", () => {
  it("returns only explicitly-permitted modules for a scoped permission list", () => {
    const perms = ["inst:dashboard", "inst:marketplace"];
    const result = allowedModules(INSTITUTION_MODULE_LIST, perms);
    const keys = result.map((m) => m.key);
    expect(keys).toContain("inst:dashboard");
    expect(keys).toContain("inst:marketplace");
    expect(keys).not.toContain("inst:bids");
  });

  it("returns an empty list when no permissions are granted", () => {
    expect(allowedModules(INSTITUTION_MODULE_LIST, [])).toEqual([]);
  });

  it("wildcard '*' for an institution user returns ONLY institution modules", () => {
    const result = allowedModules(MODULE_CATALOGUE, ["*"], "institution");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((m) => m.category === "institution")).toBe(true);
    expect(result.some((m) => m.category === "admin")).toBe(false);
  });

  it("wildcard '*' for a Ficium staff (admin) user returns nothing: platform admin moved to the Portal Admin site", () => {
    const result = allowedModules(MODULE_CATALOGUE, ["*"], "admin");
    expect(result).toEqual([]);
    expect(MODULE_CATALOGUE.some((m) => m.category === "admin")).toBe(false);
  });

  it("wildcard with unknown user_type falls back to the full list (defensive)", () => {
    const result = allowedModules(MODULE_CATALOGUE, ["*"]);
    expect(result).toEqual(MODULE_CATALOGUE);
  });

  it("ignores permission keys that don't map to any module", () => {
    const result = allowedModules(INSTITUTION_MODULE_LIST, ["inst:does_not_exist"]);
    expect(result).toEqual([]);
  });

  it("does not leak admin modules to an institution scoped-permission list", () => {
    // Even if an institution somehow has an admin key, the list is filtered to its own surface
    const result = allowedModules(INSTITUTION_MODULE_LIST, ["admin:institutions"]);
    expect(result).toEqual([]);
  });
});

describe("MODULE_CATALOGUE integrity", () => {
  it("has unique keys across every module", () => {
    const keys = MODULE_CATALOGUE.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique paths WITHIN each category", () => {
    // Paths may legitimately collide across categories — e.g. inst:dashboard and
    // admin:dashboard both map to /dashboard, resolved at runtime by DashboardRouter
    // based on user_type. Uniqueness is only required within a single surface.
    for (const category of ["institution"] as const) {
      // Embedded modules (a tab inside another page) share their host's path.
      const categoryModules = MODULE_CATALOGUE.filter((m) => m.category === category && !m.embeddedIn);
      expect(categoryModules.length).toBeGreaterThan(0);
      const paths = categoryModules.map((m) => m.path);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  it("MODULE_BY_KEY resolves every catalogue entry", () => {
    for (const m of MODULE_CATALOGUE) {
      const entry = MODULE_BY_KEY[m.key];
      expect(entry).toBeDefined();
      expect(entry!.key).toBe(m.key);
    }
  });

  it("every institution module key is prefixed inst: and every admin key admin:", () => {
    expect(INSTITUTION_MODULE_LIST.every((m) => m.key.startsWith("inst:"))).toBe(true);
    expect(ADMIN_MODULE_LIST.every((m) => m.key.startsWith("admin:"))).toBe(true);
  });

  it("every module has a non-empty label and a path starting with /", () => {
    for (const m of MODULE_CATALOGUE) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.path.startsWith("/")).toBe(true);
    }
  });
});

describe("hub consolidation", () => {
  it("approval queues open in the Inbox and configuration screens in Setup", () => {
    const pathOf = (k: string) => MODULE_CATALOGUE.find((m) => m.key === k)?.path;
    for (const k of ["inst:bid_approval", "inst:approvals", "inst:dual_control"]) {
      expect(pathOf(k)?.startsWith("/inbox")).toBe(true);
    }
    for (const k of ["inst:settings", "inst:products", "inst:benefits", "inst:doctemplates", "inst:team", "inst:audit"]) {
      expect(pathOf(k)?.startsWith("/setup")).toBe(true);
    }
  });
});

describe("embedded modules", () => {
  it("point at a real host module and share its path", () => {
    for (const m of MODULE_CATALOGUE.filter((x) => x.embeddedIn)) {
      const host = MODULE_CATALOGUE.find((x) => x.key === m.embeddedIn);
      expect(host).toBeDefined();
      expect(m.path).toBe(host!.path);
    }
  });
});
