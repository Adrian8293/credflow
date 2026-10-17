/**
 * TodayInbox — the one list that replaces the separate Tasks / Expiring / Follow-up widgets.
 * Each row has the one action that moves it forward.
 */
import { useMemo, useState } from 'react'
import { buildInbox, inboxFilter, INBOX_FILTERS } from '../../lib/inbox.js'

const SEV_BADGE = {
  expired:  { cls: 'b-red',   dot: 'critical', label: 'Expired' },
  critical: { cls: 'b-red',   dot: 'critical', label: 'Urgent' },
  warning:  { cls: 'b-amber', dot: 'warning',  label: 'Soon' },
  notice:   { cls: 'b-gray',  dot: 'info',     label: 'Upcoming' },
}
const KIND_LABEL = {
  credential: 'Credential', 'license-gap': 'License gap', task: 'Task', followup: 'Follow-up', 'enr-recred': 'Re-credential',
  'enr-term': 'Termination', 'req-review': 'Review upload', 'req-overdue': 'Requested doc',
}
const PAGE = 8

export function TodayInbox({ db, setPage, openEnrollModal, openProvDetail, openTaskModal, onDraftEmail }) {
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)

  const all = useMemo(() => buildInbox(db), [db])
  const items = inboxFilter(all, filter)
  const shown = showAll ? items : items.slice(0, PAGE)
  const count = k => inboxFilter(all, k).length

  function act(i) {
    if (i.type === 'task' && i.taskId) return openTaskModal?.(i.taskId)
    if (i.enrId) return openEnrollModal?.(i.enrId)
    if (i.type === 'req-review' || i.type === 'req-overdue') return setPage('requests')
    if (i.provId) return openProvDetail?.(i.provId)
  }
  const actionLabel = i => (i.type === 'req-review' ? 'Review' : i.type === 'task' ? 'Open task' : i.enrId ? 'Open' : i.type === 'req-overdue' ? 'View' : 'Open provider')

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px 10px', borderBottom: '1px solid var(--border-l)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>
          Needs attention {all.length > 0 && <span className="badge b-gray" style={{ marginLeft: 6 }}>{all.length}</span>}
        </span>
        <button onClick={() => setPage('alerts')} style={{ fontSize: 11, color: 'var(--pr)', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          All alerts
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-l)' }}>
        {INBOX_FILTERS.map(([k, l]) => {
          const n = k === 'all' ? all.length : count(k)
          if (k !== 'all' && n === 0) return null
          const active = filter === k
          return (
            <button key={k} type="button" onClick={() => { setFilter(k); setShowAll(false) }}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`} style={{ borderRadius: 999 }}>
              {l} <span style={{ opacity: .75 }}>{n}</span>
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-4)' }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
          You're all caught up.
        </div>
      ) : shown.map((i, idx) => {
        const b = SEV_BADGE[i.sev] || SEV_BADGE.notice
        const followupEnr = i.type === 'followup' ? db.enrollments.find(e => e.id === i.enrId) : null
        return (
          <div key={`${i.type}-${i.enrId || i.taskId || i.reqId || i.provId}-${idx}`} className="alert-feed-item"
            style={{ borderBottom: idx === shown.length - 1 ? 'none' : undefined, gap: 10 }}>
            <span className={`alert-severity ${b.dot}`} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>
                <span style={{ fontWeight: 600 }}>{KIND_LABEL[i.type] || 'Item'}</span> · {i.sub}
              </div>
            </div>
            <span className={`badge ${b.cls}`} style={{ fontSize: 10, flexShrink: 0 }}>{b.label}</span>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {followupEnr && onDraftEmail && <button className="btn btn-sm btn-ghost" onClick={() => onDraftEmail(followupEnr)}>Draft</button>}
              <button className="btn btn-sm btn-secondary" onClick={() => act(i)}>{actionLabel(i)}</button>
            </div>
          </div>
        )
      })}

      {items.length > PAGE && (
        <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--border-l)' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Show fewer' : `Show all ${items.length}`}
          </button>
        </div>
      )}
    </div>
  )
}
