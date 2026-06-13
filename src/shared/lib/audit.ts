import { supabase } from "./supabase";
import { getTokenPayload } from "./ficiumAuth";

/* ============================================================
   TYPES
   ============================================================ */

export type AuditEventType =
  | "auth" | "user" | "financial" | "document" | "admin" | "security" | "api";

export type AuditEventName =
  | "login" | "logout" | "login_failed" | "password_reset_requested"
  | "password_reset_completed" | "session_revoked" | "user_created"
  | "user_updated" | "role_changed" | "account_disabled" | "kyc_submitted"
  | "kyc_approved" | "kyc_rejected" | "financial_profile_created"
  | "financial_profile_updated" | "request_created" | "request_updated"
  | "request_cancelled" | "bid_placed" | "bid_accepted" | "bid_rejected"
  | "document_uploaded" | "document_accessed" | "document_deleted"
  | "admin_login" | "bank_approved" | "bank_rejected" | "settings_changed"
  | "suspicious_login" | "brute_force_detected"
  | "permission_escalation_attempt" | "invalid_token";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type AuditStatus = "success" | "failed" | "blocked";

export type AuditEvent = {
  eventType: AuditEventType;
  eventName: AuditEventName;
  entityType?: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  status?: AuditStatus;
  riskLevel?: RiskLevel;
  errorMessage?: string;
  endpoint?: string;
  httpMethod?: string;
};

/* ============================================================
   RISK LEVEL MAP
   ============================================================ */

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|mini|windows\sce|palm/i.test(ua)) return "mobile";
  return "desktop";
}

/* ============================================================
   ACTION CATEGORY MAPPING
   Maps legacy event names to new action_category_type values
   ============================================================ */

function toActionCategory(eventName: AuditEventName): string {
  const map: Partial<Record<AuditEventName, string>> = {
    kyc_submitted:             "kyc.status_change",
    kyc_approved:              "kyc.status_change",
    kyc_rejected:              "kyc.status_change",
    financial_profile_created: "request.submit",
    financial_profile_updated: "request.submit",
    request_created:           "request.submit",
    request_cancelled:         "request.cancel",
    bid_accepted:              "bid.accept",
    bid_placed:                "bid.submit",
    login:                     "request.submit",
    logout:                    "request.submit",
  };
  return map[eventName] ?? "request.submit";
}

/* ============================================================
   CORE LOG FUNCTION — V2
   Writes to public.audit_events via write_client_audit() RPC
   Falls back to direct insert if RPC unavailable
   Never throws — audit failures must not break user flows
   ============================================================ */

export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    const payload = getTokenPayload();
    const userId  = payload?.['sub'] as string | null ?? null;
    if (!userId) return; // not signed in — skip audit

    const actionCategory = toActionCategory(event.eventName);
    const eventLabel     = event.eventName.replace(/_/g, " ");
    const outcome        = event.status === "failed" || event.status === "blocked"
      ? "rejected" : "success";

    // V2: use write_client_audit RPC → public.audit_events
    const { error } = await supabase.rpc("write_client_audit", {
      p_client_id:       userId,
      p_action_category: actionCategory,
      p_event_label:     eventLabel,
      p_resource_type:   event.entityType ?? null,
      p_resource_id:     event.entityId ?? null,
      p_state_before:    event.oldValue ? JSON.stringify(event.oldValue) : null,
      p_state_after:     event.newValue ? JSON.stringify(event.newValue) : null,
      p_outcome:         outcome,
      p_outcome_note:    event.errorMessage ?? null,
      p_actor_device:    getDeviceType(),
    });

    if (error) {
      // Fallback: direct insert into public.audit_events
      await supabase.from("audit_events").insert({
        client_id:       userId,
        actor_id:        userId,
        actor_type:      "client_user",
        actor_role:      "client",
        action_category: actionCategory,
        event_label:     eventLabel,
        resource_type:   event.entityType ?? null,
        outcome,
        outcome_note:    event.errorMessage ?? null,
        actor_device:    getDeviceType(),
      });
    }
  } catch {
    console.warn("[audit] Failed to log event:", event.eventName);
  }
}

/* ============================================================
   CONVENIENCE WRAPPERS
   ============================================================ */

export const audit = {
  login: () =>
    logAudit({ eventType: "auth", eventName: "login" }),

  loginFailed: (errorMessage: string) =>
    logAudit({ eventType: "auth", eventName: "login_failed", status: "failed", errorMessage, riskLevel: "medium" }),

  logout: () =>
    logAudit({ eventType: "auth", eventName: "logout" }),

  passwordResetRequested: (email: string) =>
    logAudit({ eventType: "auth", eventName: "password_reset_requested", newValue: { email } }),

  passwordResetCompleted: () =>
    logAudit({ eventType: "auth", eventName: "password_reset_completed" }),

  kycSubmitted: (userId: string) =>
    logAudit({ eventType: "user", eventName: "kyc_submitted", entityType: "clients", entityId: userId }),

  financialProfileCreated: (userId: string) =>
    logAudit({ eventType: "financial", eventName: "financial_profile_created", entityType: "client_dossier", entityId: userId }),

  financialProfileUpdated: (userId: string) =>
    logAudit({ eventType: "financial", eventName: "financial_profile_updated", entityType: "client_dossier", entityId: userId }),

  requestCreated: (requestId: string, amount: number, productType: string) =>
    logAudit({
      eventType: "financial", eventName: "request_created",
      entityType: "requests", entityId: requestId,
      newValue: { amount, productType },
    }),

  bidPlaced: (bidId: string, requestId: string, rate: number) =>
    logAudit({
      eventType: "financial", eventName: "bid_placed",
      entityType: "institution_bids", entityId: bidId,
      newValue: { requestId, rate },
    }),

  bidAccepted: (bidId: string, requestId: string) =>
    logAudit({
      eventType: "financial", eventName: "bid_accepted",
      entityType: "bid_acceptances", entityId: bidId,
      newValue: { requestId }, riskLevel: "medium",
    }),

  documentUploaded: (userId: string, docType: "id" | "selfie") =>
    logAudit({
      eventType: "document", eventName: "document_uploaded",
      entityType: "document", entityId: userId,
      newValue: { docType },
    }),

  bankApproved: (bankUserId: string) =>
    logAudit({
      eventType: "admin", eventName: "bank_approved",
      entityType: "institutions", entityId: bankUserId,
      riskLevel: "high",
    }),

  suspiciousLogin: (reason: string) =>
    logAudit({
      eventType: "security", eventName: "suspicious_login",
      status: "blocked", errorMessage: reason, riskLevel: "critical",
    }),
};
