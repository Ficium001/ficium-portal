import { describe, it, expect, beforeEach, vi } from "vitest";

// ficiumAuth reads from sessionStorage; jsdom provides it but we reset between tests.
import { getTokenPayload, hasSession, getAccessToken, refreshToken } from "./ficiumAuth";

/** Build a fake unsigned JWT with the given payload (base64url, no real signature). */
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}.fake-signature`;
}

describe("ficiumAuth token helpers", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("getAccessToken returns null with no stored token", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("getAccessToken returns the stored token", () => {
    sessionStorage.setItem("ficium_at", "tok-abc");
    expect(getAccessToken()).toBe("tok-abc");
  });

  it("hasSession reflects token presence", () => {
    expect(hasSession()).toBe(false);
    sessionStorage.setItem("ficium_at", "tok-abc");
    expect(hasSession()).toBe(true);
  });

  it("getTokenPayload returns null when no token is stored", () => {
    expect(getTokenPayload()).toBeNull();
  });

  it("getTokenPayload decodes claims from a valid JWT", () => {
    const claims = {
      sub: "user-123",
      institution_id: "inst-456",
      user_role: "institution_admin",
    };
    sessionStorage.setItem("ficium_at", makeJwt(claims));
    expect(getTokenPayload()).toMatchObject(claims);
  });

  it("getTokenPayload returns null for a malformed token (no crash)", () => {
    sessionStorage.setItem("ficium_at", "not-a-jwt");
    expect(getTokenPayload()).toBeNull();
  });

  it("getTokenPayload handles base64url chars (- and _) correctly", () => {
    // Payload containing chars that produce - and _ in base64url
    const claims = { sub: "u", data: "???>>>" };
    sessionStorage.setItem("ficium_at", makeJwt(claims));
    const decoded = getTokenPayload();
    expect(decoded?.sub).toBe("u");
  });
});

describe("refreshToken concurrency + circuit breaker", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("dedups concurrent callers into a single network request", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 10));
        return {
          ok: true,
          json: async () => ({ access_token: "new-tok", expires_in: 900 }),
        } as Response;
      }),
    );

    const [a, b, c] = await Promise.all([refreshToken(), refreshToken(), refreshToken()]);

    expect(callCount).toBe(1); // 20+ React Query hooks should hit this same single request
    expect(a).toBe("new-tok");
    expect(b).toBe("new-tok");
    expect(c).toBe("new-tok");
  });

  it("opens the circuit after a failed refresh so callers fail fast instead of flooding /auth/refresh", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount++;
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }),
    );

    const first = await refreshToken();
    expect(first).toBeNull();
    expect(callCount).toBe(1);

    // Immediately retry — circuit breaker should block this without another network call.
    const second = await refreshToken();
    expect(second).toBeNull();
    expect(callCount).toBe(1);
  });
});
