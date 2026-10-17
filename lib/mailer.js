/**
 * lib/mailer.js — minimal email sender (server only). Uses Resend's HTTP API; no SDK, no dependency.
 * Resend's free plan allows 100 emails/day and 3,000/month (check current limits at resend.com/pricing).
 * Never imported by browser code.
 */
export async function sendEmail({ to, subject, html, text }) {
  const key  = process.env.RESEND_API_KEY
  const from = process.env.DIGEST_FROM
  if (!key || !from) throw new Error('Email not configured (RESEND_API_KEY / DIGEST_FROM).')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Email send failed (${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json().catch(() => ({}))
}
