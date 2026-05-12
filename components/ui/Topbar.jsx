/**
 * Topbar.jsx — PrimeCredential
 * Inline search bar (no modal/overlay), global search results drop below.
 * Clean single-line topbar with page title, search, alerts, user menu.
 */

import { useState, useEffect, useRef } from 'react'

export function Topbar({ page, setPage, openDocModal, openTaskModal, openEnrollModal, exportJSON, saving, onOpenSearch, alertCount, user, signOut, db, openProvDetail }) {
  const [userMenuOpen, setUserMenuOpen]   = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const titles = {
    dashboard: 'Dashboard', providers: 'Providers', applications: 'Applications',
    payers: 'Payers', documents: 'Documents', tasks: 'Tasks', alerts: 'Alerts',
    claims: 'Claims', eligibility: 'Eligibility', denials: 'Denial Log',
    revenue: 'Revenue Analytics', marketing: 'Marketing', reports: 'Reports',
    audit: 'Audit Trail', settings: 'Settings', 'add-provider': 'Add Provider',
    'pt-profile': 'Psychology Today Profile',
  }
  // MED-012: fallback for any page key not in the map
  const pageTitle = titles[page] || page.replace(/-/g, ' ').replace(/\w/g, c => c.toUpperCase())

  const meta        = user?.user_metadata || {}
  const displayName = (meta.first_name && meta.last_name)
    ? `${meta.first_name} ${meta.last_name}`
    : meta.first_name || meta.full_name || 'Admin'
  const initial = (displayName[0] || 'A').toUpperCase()

  return (
    <>
      <div className="topbar">
        {/* Left: search button — opens the global search overlay in index.js */}
        <div className="topbar-left" style={{ flex: '1 1 auto', minWidth: 0 }}>
          <button className="topbar-search-btn" onClick={onOpenSearch} style={{ width: '100%', maxWidth: 320 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>Search providers, apps…</span>
            <kbd>⌘K</kbd>
          </button>
        </div>

        {/* Centre: page title */}
        <div className="topbar-title" style={{ flex: '0 0 auto', fontSize: 14, fontWeight: 500, color: 'var(--text-2)', whiteSpace: 'nowrap', padding: '0 16px' }}>
          {pageTitle}
        </div>

        {/* Right: actions */}
        <div className="topbar-right">
          {saving && (
            <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text-4)' }}>
              <span className="spinner" /> Saving…
            </div>
          )}

          {/* Alert bell */}
          <button className="tb-icon-btn" title="Alerts" onClick={() => setPage('alerts')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {alertCount > 0 && <span className="tb-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
          </button>

          {/* User menu */}
          <div style={{ position:'relative' }} ref={userMenuRef}>
            <button className="tb-user-btn" onClick={() => setUserMenuOpen(o => !o)}>
              <div className="tb-avatar">{initial}</div>
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.25, textAlign:'left' }}>
                <span style={{ fontSize:12.5, fontWeight:600, color:'var(--text-1)' }}>{displayName}</span>
                <span style={{ fontSize:10.5, color:'var(--text-4)' }}>Admin</span>
              </div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--text-4)', flexShrink:0 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {userMenuOpen && (
              <div className="tb-dropdown">
                <div className="tb-dd-header">
                  <div style={{ fontWeight:600, fontSize:13, color:'var(--text-1)' }}>{displayName}</div>
                  <div style={{ fontSize:11, color:'var(--text-4)', marginTop:1 }}>{user?.email}</div>
                </div>
                {[
                  { label:'Settings',    icon:'⚙',  action: () => setPage('settings') },
                  { label:'Audit Log',   icon:'📋', action: () => setPage('audit') },
                  { label:'Export Data', icon:'⬇',  action: exportJSON },
                ].map(item => (
                  <button key={item.label} className="tb-dd-item" onClick={() => { item.action?.(); setUserMenuOpen(false) }}>
                    <span>{item.icon}</span> {item.label}
                  </button>
                ))}
                <div className="tb-dd-divider" />
                <button className="tb-dd-item danger" onClick={() => { setUserMenuOpen(false); signOut?.() }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default Topbar
