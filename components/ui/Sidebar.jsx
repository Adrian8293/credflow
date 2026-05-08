/**
 * Sidebar.jsx — CredFlow v2
 *
 * CHANGES FROM v1:
 *  - Grouped navigation: Operations / Providers / Credentialing / Billing / Admin
 *  - Billing section now visible (Claims, Eligibility, Denials, Revenue)
 *  - Collapsible mini-sidebar (expand/collapse button at bottom)
 *  - Recently visited page badge
 *  - Consistent SVG icon set (no emoji)
 *  - Section dividers with small group labels
 */

import { useState } from 'react'

// ─── BRAND MARK ──────────────────────────────────────────────────────────────
function PcMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="2" y="2" width="40" height="40" rx="11" fill="#0D1B3D"/>
      <text x="14" y="33" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="26" fill="#FFFFFF">P</text>
      <circle cx="37" cy="37" r="8.5" fill="#1E56F0" stroke="#FFFFFF" strokeWidth="2"/>
      <rect x="35.6" y="32.6" width="2.8" height="8.8" rx="1" fill="#FFFFFF"/>
      <rect x="32.6" y="35.6" width="8.8" height="2.8" rx="1" fill="#FFFFFF"/>
    </svg>
  )
}

// ─── ICONS ───────────────────────────────────────────────────────────────────
const I = {
  dashboard:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  alerts:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  tasks:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  providers:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  documents:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  applications:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  payers:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  claims:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="15" y2="11"/></svg>,
  eligibility: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  denials:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  revenue:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  marketing:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  reports:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  audit:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  settings:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>,
  chevron:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  collapse:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  expand:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
}

// ─── NAV ITEMS (flat, no categories) ─────────────────────────────────────────
const NAV_ITEMS = [
  { pg: 'dashboard',    label: 'Dashboard' },
  { pg: 'providers',    label: 'Providers' },
  { pg: 'applications', label: 'Applications' },
  { pg: 'payers',       label: 'Payers' },
  { pg: 'documents',    label: 'Documents',   badgeKey: 'expDocs', badgeCls: 'amber' },
  { pg: 'tasks',        label: 'Tasks' },
  { pg: 'alerts',       label: 'Alerts',      badgeKey: 'alerts' },
  { pg: 'claims',       label: 'Claims' },
  { pg: 'reports',      label: 'Reports' },
  { pg: 'audit',        label: 'Audit Trail' },
  { pg: 'settings',     label: 'Settings' },
]

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export function Sidebar({ page, setPage, alertCount, expDocs, user, signOut }) {
  const [collapsed, setCollapsed] = useState(false)
  const badges = { alerts: alertCount, expDocs }
  const meta = user?.user_metadata || {}
  const displayName = (meta.first_name && meta.last_name)
    ? `${meta.first_name} ${meta.last_name}`
    : meta.first_name || meta.full_name || 'Admin'
  const emailInitial = (displayName[0] || 'A').toUpperCase()

  return (
    <nav className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div className="sb-logo">
        <div className="sb-logo-mark">
          <div className="sb-logo-icon"><PcMark /></div>
          {!collapsed && (
            <div>
              <h1><span className="brand-prime">Prime</span><span className="brand-credential">Credential</span></h1>
              <div className="sb-logo-sub">Credentialing Suite</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav (flat list, non-scrollable) */}
      <div className="sb-nav">
        {NAV_ITEMS.map(({ pg, label, badgeKey, badgeCls }) => {
          const count = badgeKey ? (badges[badgeKey] || 0) : 0
          return (
            <div
              key={pg}
              className={`sb-item${page === pg ? ' active' : ''}`}
              onClick={() => setPage(pg)}
              title={collapsed ? label : undefined}
            >
              {I[pg] || I.dashboard}
              {!collapsed && <span style={{ marginLeft: 6 }}>{label}</span>}
              {count > 0 && !collapsed && (
                <span className={`sb-badge${badgeCls ? ' ' + badgeCls : ''}`}>{count}</span>
              )}
              {count > 0 && collapsed && (
                <span className="sb-badge-dot" />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: user + collapse toggle */}
      <div className="sb-footer">
        {!collapsed && (
          <div className="sb-user">
            <div className="sb-avatar">{emailInitial}</div>
            <div className="sb-user-info">
              <div className="sb-user-name">{displayName}</div>
              <div className="sb-user-email">{user?.email}</div>
              <button className="sb-signout" onClick={signOut}>Sign out →</button>
            </div>
          </div>
        )}
        <button
          className="sb-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? I.expand : I.collapse}
        </button>
      </div>
    </nav>
  )
}

export default Sidebar

/*
 * ─── ADDITIONAL CSS (add to credflow.css) ────────────────────────────────────
 *
 * .sidebar-collapsed {
 *   width: 52px !important;
 * }
 * .sidebar-collapsed .sb-item {
 *   justify-content: center;
 *   padding: 8px;
 * }
 * .sb-group-label {
 *   font-size: 9px;
 *   font-weight: 700;
 *   text-transform: uppercase;
 *   letter-spacing: .08em;
 *   color: rgba(255,255,255,.22);
 *   padding: 10px 8px 4px;
 * }
 * .sb-group-divider {
 *   height: 1px;
 *   background: var(--navy-border);
 *   margin: 6px 8px;
 * }
 * .sb-badge-dot {
 *   width: 6px; height: 6px;
 *   background: var(--danger);
 *   border-radius: 50%;
 *   position: absolute;
 *   top: 5px; right: 5px;
 * }
 * .sb-collapse-btn {
 *   display: flex;
 *   align-items: center;
 *   justify-content: center;
 *   width: 28px; height: 28px;
 *   border-radius: var(--r);
 *   color: rgba(255,255,255,.3);
 *   margin: 6px auto 0;
 *   transition: all var(--t);
 * }
 * .sb-collapse-btn:hover {
 *   background: var(--navy-hover);
 *   color: rgba(255,255,255,.7);
 * }
 */
