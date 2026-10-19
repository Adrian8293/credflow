// Only http(s) links may be opened from user-entered URLs (blocks javascript:, data:, etc.).
// Bare domains like "portal.example.com" get https:// added. Returns null when unusable.
export function safeUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch { return null }
}
