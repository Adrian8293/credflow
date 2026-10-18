/**
 * Sidebar.jsx — LACentra v5.0
 * Uses Next.js useRouter for active route detection.
 * setPage retained for backward compat with feature components.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import OrgSwitcher from './OrgSwitcher'
import { useGlobalContext } from '../../context/AppContext'

const I = {
  dashboard:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  providers:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  applications:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  payers:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  documents:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  tasks:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  alerts:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  reports:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  audit:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  settings:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>,
  chevLeft:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevRight:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  support:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  signout:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  plus:        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
}

// Route → page key mapping (for active state detection)
const ROUTE_MAP = {
  '/':            'dashboard',
  '/providers':   'providers',
  '/enrollments': 'enrollments',
  '/payers':      'payers',
  '/groups':      'groups',
  '/matrix':      'matrix',
  '/documents':   'documents',
  '/tasks':       'tasks',
  '/alerts':      'alerts',
  '/requests':    'requests',
  '/access':      'access',
  '/reports':     'reports',
  '/audit':       'audit',
  '/settings':    'settings',
  '/help':        'help',
  '/add-provider':'add-provider',
}

export function Sidebar({ page, setPage, alertCount, expDocs, user, signOut, db }) {
  const router     = useRouter()
  const { activeOrg } = useGlobalContext()
  const canManageAccess = activeOrg?.role === 'owner' || activeOrg?.role === 'admin'
  const reviewCount = (db?.requests || []).filter(r => r.status === 'submitted').length
  const [collapsed, setCollapsed] = useState(false)

  // Active detection from router (preferred) with fallback to prop
  const activePage = ROUTE_MAP[router.pathname] || page

  const taskCount        = db?.tasks?.filter(t => t.status !== 'Done').length || 0
  const overdueTaskCount = db?.tasks?.filter(t => {
    if (t.status === 'Done' || !t.due) return false
    return new Date(t.due + 'T00:00:00') < new Date(new Date().toDateString())
  }).length || 0

  const meta        = user?.user_metadata || {}
  const displayName = (meta.first_name && meta.last_name)
    ? `${meta.first_name} ${meta.last_name}`
    : meta.first_name || meta.full_name || 'Admin'
  const initial = (displayName[0] || 'A').toUpperCase()

  const routeOf = (pg) => (pg === 'dashboard' ? '/' : `/${pg}`)
  function nav(pg) { router.push(routeOf(pg)) }

  // Warm every page's code in the background so tab switches are instant (no-op in dev).
  useEffect(() => {
    const pages = ['help', 'dashboard', 'enrollments', 'requests', 'tasks', 'alerts', 'providers', 'payers', 'groups', 'matrix', 'documents', 'reports', 'audit', 'access', 'settings']
    const t = setTimeout(() => pages.forEach(pg => { try { router.prefetch(routeOf(pg)) } catch { /* ignore */ } }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function navItem(pg, label, icon, badge, badgeDanger) {
    const active = activePage === pg
    return (
      <div
        key={pg}
        className={`sb-item${active ? ' active' : ''}`}
        onClick={() => nav(pg)}
        onMouseEnter={() => { try { router.prefetch(routeOf(pg)) } catch { /* ignore */ } }}
        title={collapsed ? label : undefined}
        role="menuitem"
        aria-current={active ? 'page' : undefined}
      >
        <span className="sb-item-icon">{icon}</span>
        {!collapsed && <span className="sb-item-label">{label}</span>}
        {!collapsed && badge > 0 && (
          <span className={`sb-badge${badgeDanger ? '' : badge > 0 ? '' : ''}`}
            style={badgeDanger ? { background: 'var(--red)', color: '#fff', animation: 'pulse 2s infinite', border: 'none' } : undefined}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {collapsed && badge > 0 && (
          <span className="sb-badge-dot" style={badgeDanger ? { background: 'var(--red)' } : undefined} />
        )}
      </div>
    )
  }

  function sectionLabel(text) {
    if (collapsed) return <div className="sb-group-divider" style={{ margin: '6px 10px' }} />
    return <div style={{ padding: '12px 14px 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--sb-text-3, #8A90A6)' }}>{text}</div>
  }

  return (
    <nav className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`} role="navigation" aria-label="Main navigation">

      {/* ── Brand ── */}
      <div className="sb-logo">
        <div className="sb-logo-mark">
          {!collapsed ? (
            <div className="sb-logo-text">
              <h1>
                <span className="brand-prime">LAC</span><span className="brand-credential">entra</span>
              </h1>
              <div className="sb-logo-sub">Credentialing Intelligence</div>
              <div style={{ width: 32, height: 2, background: 'var(--pr)', borderRadius: 2, marginTop: 5, opacity: .6 }} />
            </div>
          ) : (
            <div style={{
              width: 32, height: 32, background: 'var(--pr)', borderRadius: '4px 10px 4px 4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: '-.01em',
              fontFamily: 'var(--fn-display)',
            }}>L</div>
          )}
        </div>
      </div>

      <OrgSwitcher collapsed={collapsed} />

      {/* ── Navigation ── */}
      <div className="sb-nav" role="menu">
        {navItem('dashboard',    'Today',        I.dashboard)}

        {sectionLabel('Work')}
        {navItem('enrollments',  'Applications', I.applications)}
        {navItem('requests',     'Requests',     I.documents, reviewCount, false)}
        {navItem('tasks',        'Tasks',        I.tasks,     taskCount, overdueTaskCount > 0)}
        {navItem('alerts',       'Alerts',       I.alerts,    alertCount, false)}

        {sectionLabel('People & payers')}
        {navItem('providers',    'Providers',    I.providers)}
        {navItem('payers',       'Payers',       I.payers)}
        {navItem('groups',       'Groups',       I.providers)}
        {navItem('matrix',       'Billing Matrix', I.payers)}

        {sectionLabel('Records')}
        {navItem('documents',    'Documents',    I.documents, expDocs, false)}
        {navItem('reports',      'Reports',      I.reports)}
        {navItem('audit',        'Audit Trail',  I.audit)}
        {canManageAccess && navItem('access', 'Access', I.providers)}
        {navItem('settings',     'Settings',     I.settings)}
      </div>

      {/* ── Footer ── */}
      <div className="sb-footer">
        {!collapsed && (
          <div
            className="sb-support"
            onClick={() => nav('help')}
            role="button"
            tabIndex={0}
          >
            <div className="sb-support-title">{I.support} Need help?</div>
            <div className="sb-support-sub">Open the guide</div>
          </div>
        )}

        {!collapsed && (
          <div className="sb-user" onClick={() => nav('settings')}>
            <div className="sb-avatar">{initial}</div>
            <div className="sb-user-info">
              <div className="sb-user-name">{displayName}</div>
              <div className="sb-user-email">{user?.email}</div>
            </div>
            <button
              className="sb-signout-icon"
              onClick={e => { e.stopPropagation(); signOut?.() }}
              title="Sign out"
              aria-label="Sign out"
            >
              {I.signout}
            </button>
          </div>
        )}

        <button
          className="sb-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? I.chevRight : I.chevLeft}
        </button>
      </div>
    </nav>
  )
}

export default Sidebar
