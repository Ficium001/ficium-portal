/**
 * @function provision-institution-user  (RETIRED 2026-10-21)
 *
 * The previous version was public (verify_jwt off), ran with the service-role
 * key and trusted its request body: anyone could make Ficium send invitation
 * emails to any address, create Supabase logins, and mark any pending approval
 * as failed. Its member insert targeted a table that no longer exists, so it
 * never completed a provisioning.
 *
 * This file MUST stay identical to the deployed stub: redeploying the old
 * source would reopen the hole. User provisioning is four-eyes in portal-api
 * (POST /approvals/{id}/provision-user, released once to the checker).
 * Delete the function and this folder after the Z4 lock-down (db/048).
 */
Deno.serve(() =>
  Response.json(
    { ok: false, error: "Retired. Users are provisioned through portal-api after four-eyes approval." },
    { status: 410 },
  ),
);
