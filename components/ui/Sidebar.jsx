import { useState } from 'react'

function PcMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
      <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" fill="rgba(37,99,235,.15)" stroke="#2563EB" strokeWidth="2"/>
      <text x="24" y="30" textAnchor="middle" fontFamily="Plus Jakarta Sans,sans-serif" fontWeight="800" fontSize="18" fill="#fff">P</text>
      <path d="M18 32l4.5 4.5 9-9" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const ICONS = {
  dashboard:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  providers:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  applications:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  payers:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  documents:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  tasks:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  alerts:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  marketing:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  reports:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  audit:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  settings:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>,
}

// Exactly 11 core pages — flat, no groups, no labels
const NAV = [
  { pg: 'dashboard',    label: 'Dashboard'    },
  { pg: 'providers',    label: 'Providers'    },
  { pg: 'applications', label: 'Applications' },
  { pg: 'payers',       label: 'Payers'       },
  { pg: 'documents',    label: 'Documents',   badgeKey: 'expDocs',    badgeCls: 'amber' },
  { pg: 'tasks',        label: 'Tasks'        },
  { pg: 'alerts',       label: 'Alerts',      badgeKey: 'alerts' },
  { pg: 'marketing',    label: 'Marketing'    },
  { pg: 'reports',      label: 'Reports'      },
  { pg: 'audit',        label: 'Audit Trail'  },
  { pg: 'settings',     label: 'Settings'     },
]

export function Sidebar({ page, setPage, alertCount, expDocs, user, signOut }) {
  const badges = { alerts: alertCount, expDocs }
  const meta = user?.user_metadata || {}
  const displayName = (meta.first_name && meta.last_name)
    ? `${meta.first_name} ${meta.last_name}`
    : meta.first_name || meta.full_name || 'Admin'
  const emailInitial = (displayName[0] || 'A').toUpperCase()

  return (
    <nav className="sidebar">
      <div className="sb-logo">
        <div className="sb-logo-mark">
          <div className="sb-logo-icon"><PcMark /></div>
          <div>
            <h1><span className="brand-prime">Prime</span><span className="brand-credential">Credential</span></h1>
            <div className="sb-logo-sub">Credentialing Suite</div>
          </div>
        </div>
      </div>

      <div className="sb-nav">
        <div className="sb-nav-groups">
          {NAV.map(({ pg, label, badgeKey, badgeCls }) => {
            const count = badgeKey ? (badges[badgeKey] || 0) : 0
            return (
              <div key={pg} className={`sb-item${page === pg ? ' active' : ''}`} onClick={() => setPage(pg)}>
                {ICONS[pg]}
                <span style={{ marginLeft: 4 }}>{label}</span>
                {count > 0 && <span className={`sb-badge${badgeCls ? ' ' + badgeCls : ''}`}>{count}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">{emailInitial}</div>
          <div className="sb-user-info">
            <div className="sb-user-name">{displayName}</div>
            <div className="sb-user-email">{user?.email}</div>
            <button className="sb-signout" onClick={signOut}>Sign out →</button>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Sidebar
