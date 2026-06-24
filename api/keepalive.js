// api/keepalive.js — Vercel serverless function
// Called by Vercel cron every 2 minutes to keep Railway containers warm.
// Railway free tier sleeps after ~10min; GitHub Actions cron is unreliable.

const SERVICES = [
  'https://ficium-auth-production.up.railway.app/health/live',
  'https://ficium-portal-api-production.up.railway.app/health',
]

export default async function handler(req, res) {
  const results = await Promise.allSettled(
    SERVICES.map(url =>
      fetch(url, { signal: AbortSignal.timeout(8000) })
        .then(r => ({ url, status: r.status }))
        .catch(e => ({ url, error: e.message }))
    )
  )

  const summary = results.map(r => r.value ?? r.reason)
  console.log('[keepalive]', JSON.stringify(summary))
  res.status(200).json({ ok: true, ts: new Date().toISOString(), results: summary })
}
