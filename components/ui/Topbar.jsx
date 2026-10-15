/**
 * Topbar.jsx — LACentra v5.0
 *
 * Changes from v4:
 *  - Notification bell opens a live flyout drawer (not just navigates to /alerts).
 *    Drawer shows real alert feed from db: expired → expiring → overdue tasks → follow-ups.
 *    Each row is actionable: click opens provider detail or enrollment.
 *  - Page title driven by useRouter().pathname (matches Sidebar ROUTE_MAP — no prop needed).
 *  - User menu emoji icons replaced with proper SVGs.
 *  - Outside-click closes both dropdowns via shared hook pattern.
 *  - "page" prop still accepted for backward compat but router takes precedence.
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { buildAlertFeed } from '../../lib/alerts.js'

// ─── ICONS ────────────────────────────────────────────────────────────────────
const I = {
  search: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  chevD:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  signout:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  settings:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>,
  audit:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  export: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  alert:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  task:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  cal:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>,
  ext:    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  check:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
}

// ─── ROUTE → TITLE MAP ────────────────────────────────────────────────────────
const ROUTE_TITLES = {
  '/':             'Dashboard',
  '/providers':    'Providers',
  '/enrollments':  'Applications',
  '/payers':       'Payers',
  '/documents':    'Documents',
  '/tasks':        'Tasks',
  '/alerts':       'Alerts',
  '/billing':      'Billing',
  '/marketing':    'Marketing',
  '/reports':      'Reports',
  '/audit':        'Audit Trail',
  '/settings':     'Settings',
  '/add-provider': 'Add Provider',
}

// ─── OUTSIDE CLICK HOOK ───────────────────────────────────────────────────────
function useOutsideClick(ref, onClose) {
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onClose])
}

// ─── ALERT FLYOUT ─────────────────────────────────────────────────────────────
function AlertFlyout({ db, setPage, openProvDetail, onClose }) {
  const alerts  = buildAlertFeed(db)
  const expired = alerts.filter(a => a.sev === 'expired').length
  const critical = alerts.filter(a => a.sev === 'critical').length

  function sevStyle(sev) {
    if (sev === 'expired')  return { dot: 'var(--danger)',  bg: 'rgba(239,68,68,.04)',  border: 'rgba(239,68,68,.12)'  }
    if (sev === 'critical') return { dot: 'var(--danger)',  bg: 'rgba(239,68,68,.04)',  border: 'rgba(239,68,68,.12)'  }
    if (sev === 'warning')  return { dot: 'var(--warning)', bg: 'rgba(245,158,11,.04)', border: 'rgba(245,158,11,.12)' }
    return                         { dot: 'var(--pr)',      bg: 'transparent',           border: 'var(--border-l)'     }
  }

  function typeIcon(type) {
    if (type === 'task')    return <span style={{ color: 'var(--warning)', display: 'flex' }}>{I.task}</span>
    if (type === 'followup') return <span style={{ color: 'var(--pr)',     display: 'flex' }}>{I.cal}</span>
    return                         <span style={{ color: 'var(--danger)',  display: 'flex' }}>{I.alert}</span>
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      width: 360, maxHeight: 520,
      background: 'var(--card)', border: '1.5px solid var(--border-mid)',
      borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-xl)',
      zIndex: 400, display: 'flex', flexDirection: 'column',
      animation: 'menuIn .14s ease', overflow: 'hidden',
    }} role="dialog" aria-label="Notifications">

      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-l)', background: 'var(--elevated)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.02em' }}>
              Notifications
            </div>
            <div style={{ fontSize: 11.5, color: expired > 0 ? 'var(--danger)' : critical > 0 ? 'var(--warning)' : 'var(--text-4)', marginTop: 2 }}>
              {alerts.length === 0
                ? 'All clear — no active alerts'
                : `${alerts.length} alert${alerts.length !== 1 ? 's' : ''}${expired > 0 ? ` · ${expired} expired` : critical > 0 ? ` · ${critical} critical` : ''}`}
            </div>
          </div>
          {alerts.length > 0 && (
            <button
              onClick={() => { setPage('alerts'); onClose() }}
              style={{ fontSize: 11, color: 'var(--pr)', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}
            >
              View all {I.ext}
            </button>
          )}
        </div>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {alerts.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, marginBottom: 10, opacity: .4 }}>✓</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>All credentials current</div>
            <div style={{ fontSize: 12, color: 'var(--text-4)' }}>No expiring credentials or overdue tasks.</div>
          </div>
        ) : alerts.slice(0, 20).map((a, i) => {
          const s = sevStyle(a.sev)
          return (
            <button
              key={i}
              onClick={() => { if (a.provId && openProvDetail) { openProvDetail(a.provId); onClose() } }}
              style={{
                width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 14px', background: s.bg,
                borderBottom: `1px solid ${s.border}`,
                cursor: a.provId ? 'pointer' : 'default',
                transition: 'background var(--t)',
                border: 'none', fontFamily: 'inherit', textAlign: 'left',
              }}
              onMouseEnter={e => { if (a.provId) e.currentTarget.style.background = 'var(--elevated)' }}
              onMouseLeave={e => { e.currentTarget.style.background = s.bg }}
              aria-label={`${a.title}: ${a.sub}`}
            >
              <div style={{ marginTop: 1 }}>{typeIcon(a.type)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 600,
                  color: a.sev === 'expired' || a.sev === 'critical' ? 'var(--text-1)' : 'var(--text-2)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 2,
                }}>
                  {a.title}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.sub}
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 700,
                  color: a.sev === 'expired' || a.sev === 'critical' ? 'var(--danger)' : a.sev === 'warning' ? 'var(--warning)' : 'var(--pr)',
                }}>
                  {a.days < 0 ? `${Math.abs(a.days)}d ago` : a.days === 0 ? 'Today' : `${a.days}d`}
                </div>
                {a.date && <div style={{ fontSize: 10, color: 'var(--text-5)', marginTop: 1 }}>{a.date}</div>}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      {alerts.length > 0 && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-l)', background: 'var(--elevated)', flexShrink: 0 }}>
          <button
            onClick={() => { setPage('alerts'); onClose() }}
            style={{
              width: '100%', padding: '8px', borderRadius: 'var(--r)',
              background: 'var(--card)', border: '1.5px solid var(--border)',
              fontSize: 12.5, fontWeight: 600, color: 'var(--pr)',
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 5,
              transition: 'all var(--t)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--elevated)'; e.currentTarget.style.borderColor = 'var(--pr)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            View all {alerts.length} alerts {I.ext}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── MAIN TOPBAR ──────────────────────────────────────────────────────────────
export function Topbar({
  page, setPage,
  openDocModal, openTaskModal, openEnrollModal,
  exportJSON, saving,
  onOpenSearch,
  alertCount,
  user, signOut,
  db,
  openProvDetail,
}) {
  const router = useRouter()
  const [bellOpen,     setBellOpen]     = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const bellRef    = useRef(null)
  const userRef    = useRef(null)

  useOutsideClick(bellRef, () => setBellOpen(false))
  useOutsideClick(userRef,  () => setUserMenuOpen(false))

  // Router-based title takes precedence; fall back to prop for any non-mapped route
  const routeTitle = ROUTE_TITLES[router.pathname]
  const legacyMap  = {
    dashboard: 'Dashboard', providers: 'Providers', applications: 'Applications',
    payers: 'Payers', documents: 'Documents', tasks: 'Tasks', alerts: 'Alerts',
    billing: 'Billing', marketing: 'Marketing', reports: 'Reports',
    audit: 'Audit Trail', settings: 'Settings', 'add-provider': 'Add Provider',
  }
  const pageTitle = routeTitle
    || legacyMap[page]
    || (page || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const meta        = user?.user_metadata || {}
  const displayName = (meta.first_name && meta.last_name)
    ? `${meta.first_name} ${meta.last_name}`
    : meta.first_name || meta.full_name || 'Admin'
  const initial = (displayName[0] || 'A').toUpperCase()

  // Compute live alert count from db (overrides the prop if db available)
  const liveAlertCount = db ? buildAlertFeed(db).length : (alertCount || 0)
  const showBadge      = liveAlertCount > 0

  const USER_MENU_ITEMS = [
    { label: 'Settings',    icon: I.settings, action: () => setPage('settings') },
    { label: 'Audit Log',   icon: I.audit,    action: () => setPage('audit')    },
    { label: 'Export Data', icon: I.export,   action: exportJSON                },
  ]

  return (
    <div className="topbar">

      {/* ── Search button ──────────────────────────────────────────────── */}
      <div className="topbar-left">
        <button
          className="topbar-search-btn"
          onClick={onOpenSearch}
          style={{ maxWidth: 300 }}
          aria-label="Open global search"
        >
          {I.search}
          <span>Search providers, apps…</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      {/* ── Centre: brand + page title ─────────────────────────────────── */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.02em' }}>
          LACentra
        </span>
        <span style={{ width: 1, height: 16, background: 'var(--border-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}>{pageTitle}</span>
      </div>

      {/* ── System status ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-4)', fontWeight: 500, whiteSpace: 'nowrap', padding: '0 8px' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 0 2px rgba(16,185,129,.2)', flexShrink: 0, display: 'inline-block', animation: 'pulse 3s infinite' }} />
        Operational
      </div>

      {/* ── Right cluster ──────────────────────────────────────────────── */}
      <div className="topbar-right">
        {saving && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-4)' }}>
            <span className="spinner" /> Saving…
          </div>
        )}

        {/* ── Notification bell ────────────────────────────────────────── */}
        <div style={{ position: 'relative' }} ref={bellRef}>
          <button
            className="tb-icon-btn"
            onClick={() => { setBellOpen(o => !o); setUserMenuOpen(false) }}
            aria-label={`Notifications${showBadge ? ` (${liveAlertCount} active)` : ''}`}
            aria-expanded={bellOpen}
            aria-haspopup="dialog"
            style={bellOpen ? { background: 'var(--elevated)', borderColor: 'var(--pr)', color: 'var(--pr)' } : undefined}
          >
            {I.bell}
            {showBadge && (
              <span
                className="tb-badge"
                style={liveAlertCount > 9 ? { minWidth: 18, fontSize: 8 } : undefined}
              >
                {liveAlertCount > 99 ? '99+' : liveAlertCount}
              </span>
            )}
          </button>

          {bellOpen && db && (
            <AlertFlyout
              db={db}
              setPage={setPage}
              openProvDetail={openProvDetail}
              onClose={() => setBellOpen(false)}
            />
          )}
        </div>

        {/* ── User menu ────────────────────────────────────────────────── */}
        <div style={{ position: 'relative' }} ref={userRef}>
          <button
            className="tb-user-btn"
            onClick={() => { setUserMenuOpen(o => !o); setBellOpen(false) }}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            aria-label="User menu"
          >
            <div className="tb-avatar">{initial}</div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, textAlign: 'left' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{displayName}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>Admin</span>
            </div>
            <span style={{ color: 'var(--text-4)', display: 'flex', flexShrink: 0 }}>{I.chevD}</span>
          </button>

          {userMenuOpen && (
            <div className="tb-dropdown" role="menu">
              <div className="tb-dd-header">
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{user?.email}</div>
              </div>

              {USER_MENU_ITEMS.map(item => (
                <button
                  key={item.label}
                  className="tb-dd-item"
                  role="menuitem"
                  onClick={() => { item.action?.(); setUserMenuOpen(false) }}
                >
                  <span style={{ display: 'flex', color: 'var(--text-3)' }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}

              <div className="tb-dd-divider" />

              <button
                className="tb-dd-item danger"
                role="menuitem"
                onClick={() => { setUserMenuOpen(false); signOut?.() }}
              >
                <span style={{ display: 'flex' }}>{I.signout}</span>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Topbar
