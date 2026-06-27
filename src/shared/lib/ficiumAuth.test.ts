import { describe, it, expect, beforeEach, vi } from "vitest";

// ficiumAuth reads from sessionStorage; jsdom provides it but we reset between tests.
import { getTokenPayload, hasSession, getAccessToken } from "./ficiumAuth";

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
