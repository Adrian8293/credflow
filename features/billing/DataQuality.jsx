/**
 * DataQuality.jsx — "what is missing or inconsistent" list with a jump-to-fix button per row.
 */
import { useMemo, useState } from 'react'
import { dataQualityIssues } from '../../lib/dataQuality.js'
import { toCsv } from '../../lib/reportStats.js'
import { downloadCsv } from '../../lib/csv.js'
import { todayStr } from '../../lib/matrix.js'

export function DataQuality({ db, onOpenProvider, onOpenEnrollment }) {
  const issues = useMemo(() => dataQualityIssues(db), [db])
  const [scope, setScope] = useState('all')
  const high = issues.filter(i => i.sev === 'high').length
  const shown = issues.filter(i => scope === 'all' || i.scope === scope)

  function exportCsv() {
    downloadCsv(`data-quality-${todayStr()}.csv`, toCsv(shown.map(i => ({ Type: i.scope, Name: i.who, Issue: i.issue, Priority: i.sev === 'high' ? 'High' : 'Medium' }))))
  }

  if (issues.length === 0) {
    return <div className="empty-state"><div className="empty-state-title">Everything checked is complete</div>
      <div className="empty-state-desc">Every active provider and open application has the dates and IDs that alerts and reports need.</div></div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}><strong>{issues.length}</strong> item{issues.length === 1 ? '' : 's'} to fix · <strong style={{ color: 'var(--danger)' }}>{high}</strong> high priority (hide a risk or break tracking)</span>
        <select className="filter-select" style={{ fontSize: 12, marginLeft: 'auto' }} value={scope} onChange={e => setScope(e.target.value)} aria-label="Filter by type">
          <option value="all">Everything</option><option value="provider">Providers only</option><option value="enrollment">Applications only</option><option value="document">Documents only</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={exportCsv}>↓ Export CSV</button>
      </div>
      {shown.map(i => (
        <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 6, background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${i.sev === 'high' ? 'var(--danger)' : 'var(--warning)'}`, borderRadius: 'var(--r)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{i.who}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{i.issue}</div>
          </div>
          <span className={`badge ${i.sev === 'high' ? 'b-red' : 'b-amber'}`}>{i.sev === 'high' ? 'High' : 'Medium'}</span>
          <button className="btn btn-sm btn-secondary" onClick={() => (i.scope === 'provider' ? onOpenProvider?.(i.refId) : i.scope === 'document' ? onOpenProvider?.(i.provId) : onOpenEnrollment?.(i.refId))}>
            {i.scope === 'enrollment' ? 'Open application' : 'Open provider'}
          </button>
        </div>
      ))}
    </div>
  )
}
