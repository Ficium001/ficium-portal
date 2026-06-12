/**
 * @function provision-institution-user
 * @description
 *   Called by approve_action executor when a user.create action is approved.
 *   Uses service-role key to create an auth.users row via inviteUserByEmail,
 *   then inserts the institution_members row with custom_group_id.
 *
 *   Request body (JSON):
 *     { action_id, institution_id, email, first_name, last_name,
 *       custom_group_id, member_role }
 *
 *   On success → { ok: true, user_id }
 *   On failure → { ok: false, error: string }  (HTTP 200 always so the
 *     caller can write execution_error back to pending_actions)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      action_id,
      institution_id,
      email,
      first_name,
      last_name,
      custom_group_id,
      member_role,
    } = await req.json();

    if (!action_id || !institution_id || !email || !custom_group_id) {
      return Response.json({ ok: false, error: "Missing required fields" }, { headers: corsHeaders });
    }

    // Service-role client — can create auth users
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (() => {
      // New Supabase: SUPABASE_SECRET_KEYS is a JSON dict {"<ref>": "<key>"}
      const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (secretKeys) {
        try {
          const parsed = JSON.parse(secretKeys);
          const key = Object.values(parsed)[0] as string;
          if (key) return key;
        } catch { /* fall through */ }
      }
      // Legacy fallback
      return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    })(),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Invite the user — sends a set-password email
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          first_name: first_name ?? "",
          last_name:  last_name  ?? "",
          institution_id,
          onboarding: "institution_member",
        },
        // Redirect to the portal login after they set their password
        redirectTo: `${Deno.env.get("PORTAL_URL") ?? "https://ficium-portal.vercel.app"}/login`,
      }
    );

    if (inviteError) {
      // Mark the pending action as failed
      await admin
        .from("pending_actions")
        .update({
          execution_status: "failed",
          execution_error:  inviteError.message,
          executed_at:      new Date().toISOString(),
        })
        .eq("id", action_id)
        .schema("institution");

      return Response.json({ ok: false, error: inviteError.message }, { headers: corsHeaders });
    }

    const authUserId = inviteData.user.id;

    // 2. Insert institution_members row
    const { error: memberError } = await admin
      .schema("institution")
      .from("institution_members")
      .insert({
        institution_id,
        auth_user_id:    authUserId,
        custom_group_id,
        member_role:     member_role ?? "maker",
        is_primary_admin: false,
        // role falls back to group-based resolution; set a safe default
        role: "analyst",
      });

    if (memberError) {
      // Auth user created but member row failed — store user_id in error for manual recovery
      await admin
        .schema("institution")
        .from("pending_actions")
        .update({
          execution_status: "failed",
          execution_error:  `Auth user created (${authUserId}) but member insert failed: ${memberError.message}`,
          executed_at:      new Date().toISOString(),
        })
        .eq("id", action_id);

      return Response.json(
        { ok: false, error: memberError.message, auth_user_id: authUserId },
        { headers: corsHeaders }
      );
    }

    // 3. Mark the action executed
    await admin
      .schema("institution")
      .from("pending_actions")
      .update({
        execution_status: "executed",
        executed_at:      new Date().toISOString(),
      })
      .eq("id", action_id);

    return Response.json({ ok: true, user_id: authUserId }, { headers: corsHeaders });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { headers: corsHeaders });
  }
});
