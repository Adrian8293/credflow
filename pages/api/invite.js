/**
 * POST /api/invite  { email, role, providerId? }   (owner/admin only)
 * Creates a one-time invite link. The token is shown once and only its SHA-256 hash is stored.
 * No email service is required (free to run): the admin copies the link and sends it.
 */
import crypto from 'crypto'
import { apiHandler, validateOrigin } from '../../lib/api-middleware'
import { createSessionClient } from '../../lib/supabase-server'

const ROLES = ['admin', 'credentialer', 'viewer', 'clinic_staff', 'provider']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handler(req, res, user) {
  if (!validateOrigin(req, res)) return
  const { email, role, providerId } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()

  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role.' })
  if (role === 'provider' && !providerId) return res.status(400).json({ error: 'Choose the provider this login belongs to.' })

  const session = createSessionClient(req, res)
  const { data: isAdmin } = await session.rpc('is_org_admin')
  if (isAdmin !== true) return res.status(403).json({ error: 'Only an owner or admin can invite people.' })

  if (role === 'provider') {
    const { data: prov } = await session.from('providers').select('id').eq('id', providerId).maybeSingle()
    if (!prov) return res.status(400).json({ error: 'That provider is not in this organization.' })
  }

  // Replace any earlier pending invite for the same email in this org.
  await session.from('portal_invites').update({ revoked_at: new Date().toISOString() })
    .eq('email', cleanEmail).is('accepted_at', null).is('revoked_at', null)

  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString()

  const { error } = await session.from('portal_invites').insert([{
    email: cleanEmail, role, provider_id: role === 'provider' ? providerId : null,
    token_hash: tokenHash, expires_at: expiresAt, invited_by: user.id,
  }])
  if (error) { console.error('[invite]', error.message); return res.status(500).json({ error: 'Could not create the invite.' }) }

  const proto = req.headers['x-forwarded-proto'] || 'https'
  const base = (process.env.NEXT_PUBLIC_APP_URL || `${proto}://${req.headers.host}`).replace(/\/$/, '')
  return res.status(200).json({ link: `${base}/invite?token=${token}`, expiresAt })
}

export default apiHandler({ methods: ['POST'], auth: true, rateLimit: { max: 30, windowMs: 60_000, keyPrefix: 'invite:' }, handler })
