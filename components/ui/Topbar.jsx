import { useState, useEffect, useRef } from 'react'

export function Topbar({ page, setPage, openEnrollModal, openPayerModal, openDocModal, openTaskModal, exportJSON, saving, onOpenSearch, alertCount, user, signOut }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const userMenuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const titles = { dashboard:'Dashboard', alerts:'Alerts', providers:'Providers', 'add-provider':'Add Provider', 'provider-lookup':'NPI Lookup', 'psychology-today':'Psychology Today', enrollments:'Payer Hub', pipeline:'Payer Hub', 'payer-requirements':'Payer Hub', payers:'Payer Hub', 'payer-hub':'Payer Hub', documents:'Documents & Expiry', workflows:'Workflows & Tasks', reports:'Reports & Analytics', audit:'Audit Trail', settings:'Settings', eligibility:'Eligibility Verification', claims:'Claims Tracker', denials:'Denial Log', revenue:'Revenue Analytics' }
  function topCTA() {
    if (page==='payer-hub') return // handled inside PayerHub tabs
    if (page==='enrollments') openEnrollModal()
    else if (page==='payers') openPayerModal()
    else if (page==='documents') openDocModal()
    else if (page==='workflows') openTaskModal()
  }
  const ctaLabel = page==='documents'?'＋ Add Document':page==='workflows'?'＋ New Task':null
  const emailInitial = (user?.email||'A')[0].toUpperCase()
  const displayEmail = user?.email || 'admin@credflow.io'
  const displayName = 'Admin User'

  return (
    <div className="topbar">
      {/* LEFT: breadcrumb + page title */}
      <div className="topbar-left">
        <span className="topbar-crumb">Home &rsaquo; {titles[page]||page}</span>
        <span className="topbar-title">{titles[page]||page}</span>
      </div>

      {/* RIGHT: CTA, search, bell, user */}
      <div className="topbar-actions">
        {ctaLabel && <button className="btn btn-primary btn-sm" onClick={topCTA}>{ctaLabel}</button>}

        {/* Search bar */}
        <div className="topbar-search-wrap" onClick={onOpenSearch} style={{cursor:'pointer'}}>
          <span className="topbar-search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            readOnly
            value={searchVal}
            placeholder="Search anything..."
            style={{cursor:'pointer'}}
            onFocus={onOpenSearch}
          />
          <span className="topbar-search-kbd">⌘K</span>
        </div>

        {/* Notification bell */}
        <div className="topbar-icon-btn" title="Alerts & Notifications" onClick={() => setPage('alerts')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          {alertCount > 0 && <span className="topbar-notif-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
        </div>

        {/* User / Admin button */}
        <div style={{position:'relative'}} ref={userMenuRef}>
          <div className="topbar-user-btn" onClick={() => setUserMenuOpen(o => !o)}>
            <div className="topbar-user-avatar">{emailInitial}</div>
            <div style={{display:'flex',flexDirection:'column',lineHeight:1.2}}>
              <span className="topbar-user-name">{displayName}</span>
              <span className="topbar-user-role">Administrator</span>
            </div>
            <svg className="topbar-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {userMenuOpen && (
            <div className="user-dropdown">
              <div className="user-dropdown-header">
                <div className="user-dropdown-name">{displayName}</div>
                <div className="user-dropdown-email">{displayEmail}</div>
              </div>
              <div className="user-dropdown-item" onClick={() => { setPage('settings'); setUserMenuOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>
                Settings
              </div>
              <div className="user-dropdown-item" onClick={() => { setPage('audit'); setUserMenuOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Audit Log
              </div>
              <div className="user-dropdown-item" onClick={() => { exportJSON(); setUserMenuOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Data
              </div>
              <hr className="user-dropdown-divider" />
              <div className="user-dropdown-item danger" onClick={() => { setUserMenuOpen(false); if(signOut) signOut() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── BADGE HELPERS ─────────────────────────────────────────────────────────────

export { Topbar }
