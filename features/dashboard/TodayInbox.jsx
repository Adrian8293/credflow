/**
 * TodayInbox — the one list that replaces the separate Tasks / Expiring / Follow-up widgets.
 * Two views: "Needs attention" (everything that needs a person, by urgency) and "Next 7 days" (what is coming, by day).
 * Each row has the one action that moves it forward.
 */
import { useEffect, useMemo, useState } from 'react'
import { buildInbox, inboxFilter, INBOX_FILTERS } from '../../lib/inbox.js'
import { buildWeek } from '../../lib/week.js'
import { fetchAllContracts, fetchEntities, markRosterSent } from '../../lib/db'
import { RosterFillModal } from '../billing/RosterFillModal.jsx'

const SEV_BADGE = {
  expired:  { cls: 'b-red',   dot: 'critical', label: 'Expired' },
  critical: { cls: 'b-red',   dot: 'critical', label: 'Urgent' },
  warning:  { cls: 'b-amber', dot: 'warning',  label: 'Soon' },
  notice:   { cls: 'b-gray',  dot: 'info',     label: 'Upcoming' },
}
const KIND_LABEL = {
  credential: 'Credential', 'license-gap': 'License gap', task: 'Task', followup: 'Follow-up', 'enr-recred': 'Re-credential',
  'enr-term': 'Termination', 'caqh-auth': 'CAQH', 'req-review': 'Review upload', 'req-overdue': 'Requested doc', 'roster-due': 'Roster',
}
const PAGE = 8

export function TodayInbox({ db, setPage, openEnrollModal, openProvDetail, openTaskModal, onMarkTaskDone, onCaqhAuthorized, onDraftEmail }) {
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState('inbox')   // 'inbox' | 'week'
  const [doneIds, setDoneIds] = useState([])   // rows finished this visit (hidden at once, even before the save syncs)

  const [contracts, setContracts] = useState([])
  const [entities, setEntities] = useState([])
  const [rosterFor, setRosterFor] = useState(null)   // roster-due item whose file is being filled
  const loadContracts = () => { fetchAllContracts().then(setContracts).catch(() => setContracts([])) }
  useEffect(() => { loadContracts(); fetchEntities().then(setEntities).catch(() => {}) }, [])
  async function rosterSent(i) {
    setContracts(cs => cs.map(c => c.id === i.contractId ? { ...c, lastRosterSent: new Date().toISOString().slice(0, 10) } : c))
    try { await markRosterSent(i.contractId, undefined, i.title) } catch { loadContracts() }
  }

  const all = useMemo(() => buildInbox(db, { contracts, entities }), [db, contracts, entities])
  const week = useMemo(() => buildWeek(db), [db])
  const items = inboxFilter(all, filter).filter(i => !(i.type === 'task' && doneIds.includes(i.taskId)))
  const shown = showAll ? items : items.slice(0, PAGE)
  const count = k => inboxFilter(all, k).length

  function act(i) {
    if (i.type === 'roster-due') return setRosterFor(i)
    if (i.type === 'task' && i.taskId) return openTaskModal?.(i.taskId)
    if (i.enrId) return openEnrollModal?.(i.enrId)
    if (i.type === 'req-review' || i.type === 'req-overdue') return setPage('requests')
    if (i.provId) return openProvDetail?.(i.provId)
  }
  async function finishTask(i) {
    const t = db.tasks.find(x => x.id === i.taskId)
    setDoneIds(d => [...d, i.taskId])
    try { await onMarkTaskDone(i.taskId, t?.task || i.title) } catch { setDoneIds(d => d.filter(x => x !== i.taskId)) }
  }
  const actionLabel = i => (i.type === 'req-review' ? 'Review' : i.type === 'roster-due' ? 'Fill roster' : i.type === 'task' ? 'Open task' : i.enrId ? 'Open' : i.type === 'req-overdue' ? 'View' : 'Open provider')

  function renderRow(i, idx, last) {
    const b = SEV_BADGE[i.sev] || SEV_BADGE.notice
    const followupEnr = i.type === 'followup' ? db.enrollments.find(e => e.id === i.enrId) : null
    return (
      <div key={`${i.type}-${i.enrId || i.taskId || i.reqId || i.provId}-${idx}`} className="alert-feed-item inbox-row"
        style={{ borderBottom: last ? 'none' : undefined, gap: 10 }}>
        <span className={`alert-severity ${b.dot}`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>
            <span style={{ fontWeight: 600 }}>{KIND_LABEL[i.type] || 'Item'}</span> · {i.sub}
          </div>
        </div>
        <span className={`badge ${b.cls}`} style={{ fontSize: 10, flexShrink: 0 }}>{b.label}</span>
        <div className="inbox-actions" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {i.type === 'task' && i.taskId && onMarkTaskDone && <button className="btn btn-sm btn-green" onClick={() => finishTask(i)} aria-label={`Mark done: ${i.title}`}>✓ Done</button>}
          {i.type === 'roster-due' && <button className="btn btn-sm btn-green" onClick={() => rosterSent(i)}>✓ Sent</button>}
          {i.type === 'caqh-auth' && onCaqhAuthorized && <button className="btn btn-sm btn-green" onClick={() => onCaqhAuthorized(i.enrId)}>✓ Authorized</button>}
          {followupEnr && onDraftEmail && <button className="btn btn-sm btn-ghost" onClick={() => onDraftEmail(followupEnr)}>Draft</button>}
          <button className="btn btn-sm btn-secondary" onClick={() => act(i)}>{actionLabel(i)}</button>
        </div>
      </div>
    )
  }

  const tab = (k, label, n) => (
    <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k}
      style={{ fontSize: 13.5, fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0',
        color: view === k ? 'var(--text-1)' : 'var(--text-4)', borderBottom: view === k ? '2px solid var(--pr)' : '2px solid transparent' }}>
      {label} {n > 0 && <span className="badge b-gray" style={{ marginLeft: 4 }}>{n}</span>}
    </button>
  )

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 16px 10px', borderBottom: '1px solid var(--border-l)', flexWrap: 'wrap' }}>
        {tab('inbox', 'Needs attention', all.length)}
        {tab('week', 'Next 7 days', week.total)}
        <span style={{ flex: 1 }} />
        <button onClick={() => setPage('alerts')} style={{ fontSize: 11, color: 'var(--pr)', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          All alerts
        </button>
      </div>

      {view === 'week' ? (
        <>
          {week.overdue > 0 && (
            <div style={{ padding: '9px 16px', fontSize: 12, background: 'rgba(239,68,68,.06)', color: 'var(--danger)', borderBottom: '1px solid var(--border-l)' }}>
              {week.overdue} item{week.overdue === 1 ? ' is' : 's are'} already overdue.{' '}
              <button onClick={() => { setView('inbox'); setFilter('urgent') }} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>See them</button>
            </div>
          )}
          {week.total === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-4)' }}>Nothing is due in the next 7 days.</div>
          ) : week.groups.map(g => (
            <div key={g.date}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--raised, #F3F4F9)', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                {g.label} <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--text-4)' }}>{g.items.length === 0 ? '· nothing due' : `· ${g.items.length}`}</span>
              </div>
              {g.items.map((i, idx) => renderRow(i, idx, idx === g.items.length - 1))}
            </div>
          ))}
        </>
      ) : (
        <>
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
          ) : shown.map((i, idx) => renderRow(i, idx, idx === shown.length - 1))}

          {items.length > PAGE && (
            <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--border-l)' }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAll(s => !s)}>
                {showAll ? 'Show fewer' : `Show all ${items.length}`}
              </button>
            </div>
          )}
        </>
      )}
      {rosterFor && <RosterFillModal db={db} initial={{ payerId: rosterFor.payerId, entityId: rosterFor.entityId }} onClose={() => { setRosterFor(null); loadContracts() }} />}
    </div>
  )
}
