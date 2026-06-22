// =============================================================
// Ficium Portal — Auth (institution users only)
// Stripped: no individual/business signUp.
// =============================================================
import { supabase, institutionDb } from "./supabase";
import { audit } from "./audit";

export type AuthError = {
  code:
    | "email_already_registered"
    | "weak_password"
    | "invalid_email"
    | "network"
    | "unknown";
  message: string;
};

export type SignUpResult =
  | { ok: true; userId: string; needsEmailConfirmation: boolean }
  | { ok: false; error: AuthError };

export type SignInResult =
  | { ok: true; userId: string }
  | { ok: false; error: AuthError };

/* ============================================================
   INSTITUTION SIGN UP
   ============================================================ */

export type SignUpInstitutionInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  institutionName: string;
  institutionType: "commercial_bank" | "fintech" | "micro_credit" | "leasing" | "insurance" | "cooperative" | "other";
  licenseNumber?: string;
  regulatoryBody?: string;
  phone?: string;
  country: string;
};

export async function signUpInstitution(input: SignUpInstitutionInput): Promise<SignUpResult> {
  const { email, password, firstName, lastName, institutionName, institutionType, licenseNumber, regulatoryBody, phone, country } = input;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name:        fullName,
        first_name:       firstName,
        last_name:        lastName,
        phone:            phone || "",
        role:             "bank",
        user_type:        "institution",
        institution_name: institutionName,
        institution_type: institutionType,
        license_number:   licenseNumber || "",
        regulatory_body:  regulatoryBody || "",
        country,
      },
    },
  });

  if (error) return { ok: false, error: mapAuthError(error) };
  if (!data.user) return { ok: false, error: { code: "unknown", message: "Sign up did not return a user." } };

  const { data: instData, error: instError } = await institutionDb
    .from("institution")
    .insert({
      name:                  institutionName,
      legal_name:            institutionName,
      institution_type:      institutionType,
      reg_number:            licenseNumber || null,
      regulator:             regulatoryBody || null,
      country,
      deployment_model:      "saas",
      modules:               ["marketplace"],
      onboarding_stage:      "registered",
      compliance_status:     "not_submitted",
      approved:              false,
      primary_contact_email: email,
      primary_contact_name:  fullName,
      primary_contact_phone: phone || null,
    })
    .select("id")
    .single();

  if (instError || !instData) {
    console.error("Institution row creation failed:", instError?.message);
    return { ok: true, userId: data.user.id, needsEmailConfirmation: !data.session };
  }

  await institutionDb
    .from("member")
    .insert({
      institution_id:   instData.id,
      auth_user_id:     data.user.id,
      email:            email,
      full_name:        fullName,
      role:             "admin",
      is_primary_admin: true,
      active:           true,
    });

  return { ok: true, userId: data.user.id, needsEmailConfirmation: !data.session };
}

/* ============================================================
   SIGN IN
   ============================================================ */

export async function signIn(
  email: string,
  password: string,
  rememberMe: boolean = false
): Promise<SignInResult> {
  if (rememberMe) {
    localStorage.setItem("ficium-portal-email", email);
  } else {
    localStorage.removeItem("ficium-portal-email");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await audit.loginFailed(error.message);
    return { ok: false, error: mapAuthError(error) };
  }

  if (!data.user) {
    return { ok: false, error: { code: "unknown", message: "Sign in did not return a user." } };
  }

  await audit.login();
  return { ok: true, userId: data.user.id };
}

/* ============================================================
   SIGN OUT
   ============================================================ */

export async function signOut(): Promise<void> {
  await audit.logout();
  await supabase.auth.signOut();
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function mapAuthError(err: { message?: string; code?: string; status?: number }): AuthError {
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("already registered") || msg.includes("user already")) {
    return { code: "email_already_registered", message: "An account with this email already exists." };
  }
  if (msg.includes("password") && (msg.includes("weak") || msg.includes("short"))) {
    return { code: "weak_password", message: "Password is too weak. Use at least 8 characters." };
  }
  if (msg.includes("email") && msg.includes("invalid")) {
    return { code: "invalid_email", message: "That doesn't look like a valid email address." };
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return { code: "network", message: "Network error. Check your connection and try again." };
  }
  return { code: "unknown", message: err.message || "Something went wrong. Please try again." };
}
