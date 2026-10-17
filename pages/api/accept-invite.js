/**
 * POST /api/accept-invite  { token, password, firstName?, lastName? }   (public)
 * Creates the account with the password the person chose (public sign-up can stay OFF in Supabase),
 * or, if they are already signed in with the invited email, just adds the membership.
 */
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { enforceRateLimit, validateOrigin } from '../../lib/api-middleware'
import { createSessionClient } from '../../lib/supabase-server'

function passwordProblem(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters.'
  if (p.length > 128) return 'Password is too long.'
  if (!/[A-Z]/.test(p)) return 'Password must contain an uppercase letter.'
  if (!/[0-9]/.test(p)) return 'Password must contain a number.'
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!enforceRateLimit(req, res, { max: 10, windowMs: 60_000, keyPrefix: 'accept-invite:' })) return
  if (!validateOrigin(req, res)) return

  const { token, password, firstName, lastName } = req.body || {}
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
    return res.status(404).json({ error: 'This invite link is not valid.' })
  }

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  const hash = crypto.createHash('sha256').update(token).digest('hex')

  // Who is calling? (signed-in session is optional)
  let sessionUser = null
  try {
    const { data } = await createSessionClient(req, res).auth.getUser()
    sessionUser = data?.user || null
  } catch (_) { /* not signed in */ }

  // Claim the invite atomically so a link cannot be used twice.
  const { data: inv } = await svc.from('portal_invites').update({ accepted_at: new Date().toISOString() })
    .eq('token_hash', hash).is('accepted_at', null).is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, email, role, org_id, provider_id').maybeSingle()
  if (!inv) return res.status(404).json({ error: 'This invite link is not valid or has expired. Ask for a new one.' })

  const unclaim = () => svc.from('portal_invites').update({ accepted_at: null }).eq('id', inv.id)

  let userId = null
  let createdNow = false

  if (sessionUser) {
    if ((sessionUser.email || '').toLowerCase() !== inv.email.toLowerCase()) {
      await unclaim()
      return res.status(403).json({ error: `This invite is for ${inv.email}. Sign out and open the link again.` })
    }
    userId = sessionUser.id
  } else {
    const problem = passwordProblem(password)
    if (problem) { await unclaim(); return res.status(400).json({ error: problem }) }

    const { data: created, error: cErr } = await svc.auth.admin.createUser({
      email: inv.email, password, email_confirm: true,
      user_metadata: { first_name: String(firstName || '').slice(0, 60), last_name: String(lastName || '').slice(0, 60) },
    })
    if (cErr || !created?.user) {
      await unclaim()
      const exists = /already|registered|exists/i.test(cErr?.message || '')
      return res.status(exists ? 409 : 500).json({
        error: exists
          ? 'An account with this email already exists. Sign in first, then open this invite link again.'
          : 'Could not create your account. Please try again.',
        code: exists ? 'account_exists' : 'create_failed',
      })
    }
    userId = created.user.id
    createdNow = true
  }

  // Membership (never downgrade someone who is already a member).
  const { data: existing } = await svc.from('organization_members')
    .select('role').eq('org_id', inv.org_id).eq('user_id', userId).maybeSingle()
  if (!existing) {
    const { error: mErr } = await svc.from('organization_members').insert([{
      org_id: inv.org_id, user_id: userId, role: inv.role, provider_id: inv.provider_id,
    }])
    if (mErr) {
      console.error('[accept-invite] membership:', mErr.message)
      if (createdNow) await svc.auth.admin.deleteUser(userId)
      await unclaim()
      return res.status(500).json({ error: 'Could not finish setting up your access. Please try again.' })
    }
  }

  await svc.from('portal_invites').update({ accepted_by: userId }).eq('id', inv.id)
  await svc.from('audit_log').insert([{
    org_id: inv.org_id, type: 'Access', action: 'Invite accepted',
    detail: `${inv.email} joined as ${inv.role}`, entity: inv.id, performed_by: userId, user_email: inv.email,
  }])

  return res.status(200).json({ ok: true, email: inv.email, signedIn: !!sessionUser })
}
