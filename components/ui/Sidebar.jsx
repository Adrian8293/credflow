/**
 * Sidebar.jsx — PrimeCredential
 * 12 top-level nav items exactly as specified.
 * Billing expands inline to show Claims, Eligibility, Denial Log, Revenue.
 * Marketing expands inline to show Psychology Today.
 */

import { useState } from 'react'

function PcMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#1E56F0"/>
      <text x="11" y="35" fontFamily="Inter,system-ui,sans-serif" fontWeight="800" fontSize="28" fill="#FFFFFF">P</text>
    </svg>
  )
}

const I = {
  dashboard:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  providers:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  applications:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  payers:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  documents:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  tasks:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  alerts:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  billing:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  claims:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
  eligibility: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  denials:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  revenue:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  marketing:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  pt:          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  reports:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  audit:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  settings:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>,
  chevDown:    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  chevUp:      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
  collapse:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  expand:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  support:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
}

// Exactly 12 top-level items
const BILLING_PAGES = ['claims','eligibility','denials','revenue']
const MARKETING_PAGES = ['marketing','pt-profile']

export function Sidebar({ page, setPage, alertCount, expDocs, user, signOut, db }) {
  const [collapsed, setCollapsed]       = useState(false)
  const [billingOpen, setBillingOpen]   = useState(BILLING_PAGES.includes(page))
  const [marketingOpen, setMarketingOpen] = useState(MARKETING_PAGES.includes(page))

  const taskCount = db?.tasks?.filter(t => t.status !== 'Done').length || 0
  const meta = user?.user_metadata || {}
  const displayName = (meta.first_name && meta.last_name)
    ? `${meta.first_name} ${meta.last_name}`
    : meta.first_name || meta.full_name || 'Admin'
  const initial = (displayName[0] || 'A').toUpperCase()

  const isBillingActive   = BILLING_PAGES.includes(page)
  const isMarketingActive = page === 'marketing'

  function navItem(pg, label, icon, badge, badgeCls) {
    const active = page === pg
    return (
      <div key={pg} className={`sb-item${active ? ' active' : ''}`}
        onClick={() => setPage(pg)}
        title={collapsed ? label : undefined}>
        <span className="sb-item-icon">{icon}</span>
        {!collapsed && <span className="sb-item-label">{label}</span>}
        {!collapsed && badge > 0 && (
          <span className={`sb-badge${badgeCls ? ' ' + badgeCls : ''}`}>{badge > 99 ? '99+' : badge}</span>
        )}
        {collapsed && badge > 0 && <span className="sb-badge-dot" />}
      </div>
    )
  }

  function expandableItem(pg, label, icon, children, isOpen, toggle, badge) {
    const active = page === pg || children.some(c => c.pg === page)
    return (
      <div key={pg}>
        <div className={`sb-item${active ? ' active' : ''}`}
          onClick={() => { if (collapsed) { setCollapsed(false); toggle(true) } else toggle(o => !o) }}
          title={collapsed ? label : undefined}>
          <span className="sb-item-icon">{icon}</span>
          {!collapsed && <span className="sb-item-label">{label}</span>}
          {!collapsed && badge > 0 && <span className="sb-badge">{badge}</span>}
          {!collapsed && <span className="sb-expand-icon">{isOpen ? I.chevUp : I.chevDown}</span>}
          {collapsed && badge > 0 && <span className="sb-badge-dot" />}
        </div>
        {!collapsed && isOpen && (
          <div className="sb-children">
            {children.map(c => (
              <div key={c.pg} className={`sb-child${page === c.pg ? ' active' : ''}`}
                onClick={() => setPage(c.pg)}>
                <span className="sb-child-icon">{c.icon}</span>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div className="sb-logo">
        <div className="sb-logo-mark">
          <PcMark size={collapsed ? 26 : 28} />
          {!collapsed && (
            <div className="sb-logo-text">
              <h1><span className="brand-prime">Prime</span><span className="brand-credential">Credential</span></h1>
              <div className="sb-logo-sub">Credentialing Platform</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation — exactly 12 top-level items */}
      <div className="sb-nav">
        {navItem('dashboard',    'Dashboard',    I.dashboard)}
        {navItem('providers',    'Providers',    I.providers)}
        {navItem('applications', 'Applications', I.applications)}
        {navItem('payers',       'Payers',       I.payers)}
        {navItem('documents',    'Documents',    I.documents, expDocs, 'amber')}
        {navItem('tasks',        'Tasks',        I.tasks,     taskCount)}
        {navItem('alerts',       'Alerts',       I.alerts,    alertCount)}

        {expandableItem('billing', 'Billing', I.billing, [
          { pg: 'claims',      label: 'Claims',       icon: I.claims },
          { pg: 'eligibility', label: 'Eligibility',  icon: I.eligibility },
          { pg: 'denials',     label: 'Denial Log',   icon: I.denials },
          { pg: 'revenue',     label: 'Revenue',      icon: I.revenue },
        ], billingOpen, setBillingOpen)}

        {expandableItem('marketing', 'Marketing', I.marketing, [
          { pg: 'marketing', label: 'Psychology Today', icon: I.pt },
        ], marketingOpen, setMarketingOpen)}

        {navItem('reports',  'Reports',     I.reports)}
        {navItem('audit',    'Audit Trail', I.audit)}
        {navItem('settings', 'Settings',    I.settings)}
      </div>

      {/* Footer */}
      <div className="sb-footer">
        {!collapsed && (
          <div className="sb-support" onClick={() => window.open('mailto:support@primecredential.com')}>
            <div className="sb-support-title">{I.support} Need Help?</div>
            <div className="sb-support-sub">Contact Support</div>
          </div>
        )}
        {!collapsed && (
          <div className="sb-user">
            <div className="sb-avatar">{initial}</div>
            <div className="sb-user-info">
              <div className="sb-user-name">{displayName}</div>
              <div className="sb-user-email">{user?.email}</div>
            </div>
            <button className="sb-signout-icon" onClick={signOut} title="Sign out">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        )}
        <button className="sb-collapse-btn" onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? I.expand : I.collapse}
        </button>
      </div>
    </nav>
  )
}

export default Sidebar
