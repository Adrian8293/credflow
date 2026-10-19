/**
 * SetupChecklist — "Get set up" card for owners/admins of a workspace that is not fully set up yet.
 * Progress is computed from real data (nothing to maintain, nothing to forget to tick).
 * Hidden per person and per organization with "Hide", and disappears by itself when everything is done.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const hiddenKey = (orgId) => `lc_setup_hidden_${orgId || 'x'}`
const readHidden = (orgId) => { try { return localStorage.getItem(hiddenKey(orgId)) === '1' } catch { return false } }

export function SetupChecklist({ db, role, orgId, setPage, openEnrollModal }) {
  const isAdmin = role === 'owner' || role === 'admin'
  const [hidden, setHidden] = useState(() => readHidden(orgId))
  const [extra, setExtra] = useState({ entities: null, people: null, mfa: null })   // null = still checking

  useEffect(() => { setHidden(readHidden(orgId)) }, [orgId])

  useEffect(() => {
    if (!isAdmin || hidden) return
    let live = true
    ;(async () => {
      const [ent, mem, inv, mfa] = await Promise.all([
        supabase.from('legal_entities').select('id', { count: 'exact', head: true }),
        supabase.rpc('org_members_admin'),
        supabase.from('portal_invites').select('id', { count: 'exact', head: true }).is('accepted_at', null).is('revoked_at', null),
        supabase.auth.mfa.listFactors(),
      ]).catch(() => [{}, {}, {}, {}])
      if (!live) return
      setExtra({
        entities: ent?.error ? false : (ent?.count ?? 0) > 0,
        people: mem?.error ? false : (mem?.data?.length ?? 0) > 1 || (inv?.count ?? 0) > 0,
        mfa: mfa?.error ? false : (mfa?.data?.totp || []).some(f => f.status === 'verified'),
      })
    })()
    return () => { live = false }
  }, [isAdmin, hidden, orgId])

  if (!isAdmin || hidden) return null

  const steps = [
    { key: 'payers',    done: db.payers.length > 0,      title: 'Add the payers you work with',            hint: 'Medicaid, commercial plans, Medicare…',              cta: 'Add payers',     go: () => setPage('payers') },
    { key: 'entities',  done: extra.entities,            title: 'Set up your legal entity',                hint: 'Name, Type 2 NPI, EIN (last 4 only), locations',     cta: 'Open Groups',    go: () => setPage('groups') },
    { key: 'providers', done: db.providers.length > 0,   title: 'Add your first provider',                 hint: 'Start from an NPI and Lacentra fills in the rest',   cta: 'Add provider',   go: () => setPage('add-provider') },
    { key: 'enroll',    done: db.enrollments.length > 0, title: 'Start a payer enrollment',                hint: 'Track each application from submitted to active',   cta: 'New enrollment', go: () => openEnrollModal() },
    { key: 'people',    done: extra.people,              title: 'Invite a teammate or a provider',         hint: 'Providers upload documents and see their own status', cta: 'Open Access',   go: () => setPage('access') },
    { key: 'mfa',       done: extra.mfa,                 title: 'Turn on two-step verification',           hint: 'An authenticator app protects your own sign-in',     cta: 'Open Security',  go: () => setPage('settings') },
  ]
  const known = steps.filter(s => s.done !== null)
  const doneCount = steps.filter(s => s.done === true).length
  if (known.length === steps.length && doneCount === steps.length) return null

  const hide = () => { try { localStorage.setItem(hiddenKey(orgId), '1') } catch { /* storage unavailable */ } setHidden(true) }
  const firstOpen = steps.find(s => s.done !== true)

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px 10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>Get set up</span>
        <span className="badge b-gray">{doneCount} of {steps.length} done</span>
        <div style={{ flex: 1, minWidth: 80, height: 6, background: 'var(--elevated)', borderRadius: 99, overflow: 'hidden' }} aria-hidden="true">
          <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', background: 'var(--pr)', transition: 'width .3s' }} />
        </div>
        <button onClick={hide} style={{ fontSize: 11.5, color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Hide</button>
      </div>
      <div>
        {steps.map(s => {
          const isNext = firstOpen?.key === s.key
          return (
            <div key={s.key} className={`alert-feed-item${s.done === true ? ' sc-done' : ''}`} style={{ gap: 12, alignItems: 'center', opacity: s.done === true ? 0.6 : 1 }}>
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                background: s.done === true ? 'var(--success, #12b76a)' : 'transparent', color: '#fff', border: s.done === true ? 'none' : '1.5px solid var(--border-mid, #d0d5dd)' }}>
                {s.done === true ? '✓' : ''}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', textDecoration: s.done === true ? 'line-through' : 'none' }}>{s.title}</div>
                <div className="sc-hint" style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{s.hint}</div>
              </div>
              {s.done !== true && (
                <button className={`btn btn-sm ${isNext ? 'btn-primary' : 'btn-secondary'}`} onClick={s.go}>{s.cta}</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
