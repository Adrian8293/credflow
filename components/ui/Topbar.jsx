import { useState, useEffect, useRef } from 'react'

export function Topbar({ page, setPage, openDocModal, openTaskModal, exportJSON, saving, onOpenSearch, alertCount, user, signOut }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const titles = {
    dashboard:    'Dashboard',
    providers:    'Providers',
    applications: 'Applications',
    payers:       'Payers',
    documents:    'Documents',
    tasks:        'Tasks',
    alerts:       'Alerts',
    marketing:    'Marketing',
    reports:      'Reports',
    audit:        'Audit Trail',
    settings:     'Settings',
  }

  const ctaLabel = page === 'documents' ? '+ Add Document'
    : page === 'tasks' ? '+ New Task'
    : page === 'providers' ? '+ Add Provider'
    : null

  function handleCTA() {
    if (page === 'documents') openDocModal?.()
    else if (page === 'tasks') openTaskModal?.()
  }

  const meta = user?.user_metadata || {}
  const displayName = (meta.first_name && meta.last_name)
    ? `${meta.first_name} ${meta.last_name}`
    : meta.first_name || meta.full_name || 'Admin'
  const displayEmail = user?.email || ''
  const emailInitial = displayName[0]?.toUpperCase() || 'A'

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{titles[page] || page}</span>
      </div>
      <div className="topbar-actions">
        {ctaLabel && page !== 'providers' && (
          <button className="btn btn-primary btn-sm" onClick={handleCTA}>{ctaLabel}</button>
        )}

        <div className="topbar-search-wrap" onClick={onOpenSearch} style={{ cursor: 'pointer' }}>
          <span className="topbar-search-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input readOnly placeholder="Search anything…" style={{ cursor: 'pointer' }} onFocus={onOpenSearch} />
          <span className="topbar-search-kbd">⌘K</span>
        </div>

        {saving && (
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--text-3)' }}>
            <span className="spinner" /> Saving…
          </div>
        )}

        <div className="topbar-icon-btn" title="Alerts" onClick={() => setPage('alerts')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {alertCount > 0 && <span className="topbar-notif-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
        </div>

        <div style={{ position: 'relative' }} ref={userMenuRef}>
          <div className="topbar-user-btn" onClick={() => setUserMenuOpen(o => !o)}>
            <div className="topbar-user-avatar">{emailInitial}</div>
            <div style={{ display:'flex', flexDirection:'column', lineHeight:1.25 }}>
              <span className="topbar-user-name">{displayName}</span>
              <span className="topbar-user-role">Credentialing Specialist</span>
            </div>
            <svg className="topbar-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {userMenuOpen && (
            <div className="user-dropdown">
              <div className="user-dropdown-header">
                <div className="user-dropdown-name">{displayName}</div>
                <div className="user-dropdown-email">{displayEmail}</div>
              </div>
              <div className="user-dropdown-item" onClick={() => { setPage('settings'); setUserMenuOpen(false) }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>
                Settings
              </div>
              <div className="user-dropdown-item" onClick={() => { setPage('audit'); setUserMenuOpen(false) }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Audit Log
              </div>
              <div className="user-dropdown-item" onClick={() => { exportJSON?.(); setUserMenuOpen(false) }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Data
              </div>
              <hr className="user-dropdown-divider" />
              <div className="user-dropdown-item danger" onClick={() => { setUserMenuOpen(false); signOut?.() }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Topbar
