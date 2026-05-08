import { fmtTS } from '../../lib/helpers.js'
import { Badge } from '../../components/ui/Badge.jsx'

const TYPE_COLOR = {
  Provider:   'b-purple',
  Enrollment: 'b-blue',
  Document:   'b-teal',
  Task:       'b-green',
  Payer:      'b-gold',
  Settings:   'b-gray',
}

const TYPE_ICON = {
  Provider:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Enrollment: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Document:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  Task:       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  Payer:      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Settings:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>,
}

export function Audit({ db, search, setSearch, fType, setFType, handleClearAudit }) {
  const list = db.auditLog.filter(a =>
    `${a.type} ${a.action} ${a.detail}`.toLowerCase().includes(search.toLowerCase()) &&
    (!fType || a.type === fType)
  )

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search-box">
          <span className="si">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search audit log…"
          />
        </div>
        <select className="filter-select" value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">All Action Types</option>
          <option value="Provider">Provider</option>
          <option value="Enrollment">Enrollment</option>
          <option value="Document">Document</option>
          <option value="Task">Task</option>
          <option value="Payer">Payer</option>
          <option value="Settings">Settings</option>
        </select>
        <div className="toolbar-right">
          <button className="btn btn-secondary btn-sm" onClick={handleClearAudit}>Clear Log</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ maxHeight: 620, overflowY: 'auto', padding: '0 18px' }}>
          {!list.length ? (
            <div className="empty-state">
              <div className="ei">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </div>
              <h4>No Audit Entries</h4>
              <p>Actions taken in the system will appear here.</p>
            </div>
          ) : list.map((a, i) => (
            <div key={a.id || i} className="audit-entry">
              <div className="audit-dot" style={{ background: a.type === 'Provider' ? 'var(--purple)' : a.type === 'Enrollment' ? 'var(--pr)' : a.type === 'Document' ? 'var(--cyan)' : a.type === 'Task' ? 'var(--success)' : 'var(--text-4)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <Badge cls={TYPE_COLOR[a.type] || 'b-gray'}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {TYPE_ICON[a.type]}
                      {a.type}
                    </span>
                  </Badge>
                  <span style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--text-1)' }}>{a.action}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-4)', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtTS(a.ts)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{a.detail || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Audit
