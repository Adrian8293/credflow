/**
 * SetupChecklist — "Get set up" card for owners/admins of a workspace that is not fully set up yet.
 * Progress is computed from real data (nothing to maintain, nothing to forget to tick).
 * Hidden per person and per organization with "Hide", and disappears by itself when everything is done.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const hiddenKey = (orgId) => `lc_setup_hidden_${orgId || 'x'}`
const openKey = (orgId) => `lc_setup_open_${orgId || 'x'}`
const readHidden = (orgId) => { try { return localStorage.getItem(hiddenKey(orgId)) === '1' } catch { return false } }

export function SetupChecklist({ db, role, orgId, setPage, openEnrollModal, compact = false }) {
  const isAdmin = role === 'owner' || role === 'admin'
  const [hidden, setHidden] = useState(() => readHidden(orgId))
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState({ entities: null, people: null, mfa: null })   // null = still checking

  useEffect(() => { setHidden(readHidden(orgId)); try { setOpen(localStorage.getItem(openKey(orgId)) === '1') } catch { /* ignore */ } }, [orgId])
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem(openKey(orgId), n ? '1' : '0') } catch { /* ignore */ } return n })

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

  // Compact form (Today sidebar): one quiet card with the next step and a thin progress line.
  if (compact) {
    return (
      <div className="card setup-compact">
        <div className="setup-compact-head">
          <span className="setup-compact-title">Setup</span>
          <span className="setup-compact-count">{doneCount} of {steps.length}</span>
          <button onClick={hide} className="x-hide" aria-label="Hide the setup card">Hide</button>
        </div>
        <div className="setup-compact-bar" aria-hidden="true"><div style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
        {firstOpen && (
          <div className="setup-compact-next">
            <div><span className="setup-compact-label">Next</span><div className="setup-compact-step">{firstOpen.title}</div></div>
            <button className="btn btn-sm btn-secondary" onClick={firstOpen.go}>{firstOpen.cta}</button>
          </div>
        )}
        <button onClick={toggle} className="x-link setup-compact-toggle" aria-expanded={open}>{open ? 'Hide all steps' : 'See all steps'}</button>
        {open && (
          <ul className="setup-compact-list">
            {steps.map(s => (
              <li key={s.key} className={s.done === true ? 'is-done' : ''}>
                <span aria-hidden="true" className="setup-dot">{s.done === true ? '✓' : ''}</span>
                <span className="setup-li-text">{s.title}</span>
                {s.done !== true && <button className="x-link" onClick={s.go}>{s.cta}</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px 10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>Get set up</span>
        <span className="badge b-gray">{doneCount} of {steps.length} done</span>
        <div style={{ flex: 1, minWidth: 80, height: 6, background: 'var(--elevated)', borderRadius: 99, overflow: 'hidden' }} aria-hidden="true">
          <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', background: 'var(--pr-solid)', transition: 'width .3s' }} />
        </div>
        <button onClick={toggle} className="x-link" aria-expanded={open}>{open ? 'Close list' : 'Show steps'}</button>
        <button onClick={hide} className="x-hide" aria-label="Hide the setup card">Hide</button>
      </div>
      {!open && firstOpen && (
        <div style={{ padding: '0 16px 12px', fontSize: 12.5, color: 'var(--text-3)' }}>Next: <b>{firstOpen.title}</b></div>
      )}
      <div style={{ display: open ? 'block' : 'none' }}>
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
