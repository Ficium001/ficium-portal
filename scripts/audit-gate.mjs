#!/usr/bin/env node
// =============================================================================
// Dependency audit gate
//
// Wraps `npm audit` so that a high/critical advisory with NO available upstream
// fix can be accepted deliberately, in writing, with an expiry date -- instead
// of the two bad alternatives: dropping the gate entirely, or force-downgrading
// a dependency to an older release to satisfy a scanner.
//
// Rules:
//   * any high/critical advisory NOT in ALLOWLIST fails the build
//   * an allowlisted entry past its reviewBy date fails the build, so an
//     exception cannot quietly become permanent
//   * every suppression is printed on each run, so it stays visible
// =============================================================================

import { execSync } from "node:child_process";

const ALLOWLIST = [
  {
    ghsa: "GHSA-qwww-vcr4-c8h2",
    package: "react-router",
    reason:
      "CSRF bypass in React Router's RSC (React Server Components) mode. This " +
      "app is a client-rendered Vite SPA using createBrowserRouter/RouterProvider " +
      "(src/app/routes.tsx, src/main.tsx (ficium-portal)); it has no RSC entrypoint and no " +
      "server-side action handling, so the vulnerable code path is not reachable. " +
      "No fixed release exists: the advisory covers 7.12.0-8.2.0 and the latest " +
      "published react-router-dom is 7.18.1, so the only npm-offered 'fix' is a " +
      "downgrade to 7.11.0 -- older, breaking, and no safer for this usage.",
    reviewBy: "2026-10-31",
  },
];

const raw = (() => {
  try {
    // npm audit exits non-zero when it finds anything; capture output either way.
    return execSync("npm audit --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
})();

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error("audit-gate: could not parse `npm audit --json` output.");
  process.exit(1);
}

const BLOCKING = new Set(["high", "critical"]);
const today = new Date().toISOString().slice(0, 10);

const findings = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (!BLOCKING.has(v.severity)) continue;
  for (const via of v.via ?? []) {
    if (typeof via !== "object" || !via.url) continue;
    const ghsa = via.url.split("/").pop();
    findings.push({ package: name, ghsa, title: via.title, severity: v.severity });
  }
}

const unexpected = [];
const suppressed = [];
const expired = [];

for (const f of findings) {
  const entry = ALLOWLIST.find((a) => a.ghsa === f.ghsa);
  if (!entry) unexpected.push(f);
  else if (entry.reviewBy < today) expired.push({ ...f, reviewBy: entry.reviewBy });
  else suppressed.push({ ...f, reason: entry.reason, reviewBy: entry.reviewBy });
}

for (const s of suppressed) {
  console.log(`ACCEPTED  ${s.severity.padEnd(8)} ${s.ghsa}  ${s.package}`);
  console.log(`          ${s.title}`);
  console.log(`          reason: ${s.reason}`);
  console.log(`          review by: ${s.reviewBy}\n`);
}

for (const e of expired) {
  console.error(
    `::error::Accepted advisory ${e.ghsa} (${e.package}) passed its review date ` +
      `${e.reviewBy}. Re-check whether a fixed release now exists, then either ` +
      `upgrade or extend the entry in scripts/audit-gate.mjs with a fresh rationale.`,
  );
}

for (const u of unexpected) {
  console.error(`::error::Unreviewed ${u.severity} advisory ${u.ghsa} in ${u.package}: ${u.title}`);
}

if (expired.length || unexpected.length) {
  console.error(
    `\naudit-gate: FAILED (${unexpected.length} unreviewed, ${expired.length} expired).`,
  );
  process.exit(1);
}

console.log(
  `audit-gate: passed (${suppressed.length} accepted exception(s), no unreviewed high/critical advisories).`,
);
