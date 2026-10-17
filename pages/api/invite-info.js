/** GET /api/invite-info?token=...  (public) — what the invite page shows before the person sets a password. */
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { enforceRateLimit } from '../../lib/api-middleware'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!enforceRateLimit(req, res, { max: 30, windowMs: 60_000, keyPrefix: 'invite-info:' })) return

  const token = String(req.query.token || '')
  if (token.length < 20 || token.length > 200) return res.status(404).json({ error: 'This invite link is not valid.' })

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  const hash = crypto.createHash('sha256').update(token).digest('hex')

  const { data: inv } = await svc.from('portal_invites')
    .select('email, role, org_id, provider_id, expires_at, accepted_at, revoked_at').eq('token_hash', hash).maybeSingle()
  if (!inv || inv.accepted_at || inv.revoked_at || new Date(inv.expires_at) < new Date()) {
    return res.status(404).json({ error: 'This invite link is not valid or has expired. Ask your credentialing team for a new one.' })
  }
  const { data: org } = await svc.from('organizations').select('name').eq('id', inv.org_id).maybeSingle()
  return res.status(200).json({ email: inv.email, role: inv.role, orgName: org?.name || 'your organization' })
}
