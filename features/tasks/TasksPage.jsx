/**
 * TasksPage.jsx — Lacentra
 * Task list grouped by urgency, with search, provider filter, quick add and reopen.
 * Credentialing tasks only; do not put patient information in task text.
 */
import { useMemo, useState } from 'react'
import { daysUntil, fmtDate } from '../../lib/helpers.js'
import { DateInput } from '../../components/ui/DateInput.jsx'
import { usePersistedState } from '../../hooks/usePersistedState.js'

const PRI_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 }
const FILTERS = ['open', 'overdue', 'week', 'urgent', 'done', 'all']
const isDone = (t) => t.status === 'Done'
const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const pname = (providers, id) => { const p = providers.find(x => x.id === id); return p ? `${p.fname} ${p.lname}`.trim() : '' }

function sectionOf(t) {
  const d = daysUntil(t.due)
  if (d === null) return 'nodate'
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d <= 7) return 'week'
  return 'later'
}
const SECTION_LABEL = { overdue: 'Overdue', today: 'Due today', week: 'Next 7 days', later: 'Later', nodate: 'No due date' }
const SECTION_ORDER = ['overdue', 'today', 'week', 'later', 'nodate']

export function TasksPage({ db, openTaskModal, openProvDetail, handleMarkDone, handleReopen, handleDeleteTask, handleQuickAdd }) {
  const [filter, setFilter] = usePersistedState('lc_pref_tasks_filter', 'open', v => FILTERS.includes(v))
  const [search, setSearch] = useState('')
  const [fProv, setFProv]   = useState('')
  const [completing, setCompleting] = useState(new Set())
  const [qaText, setQaText] = useState('')
  const [qaDue, setQaDue]   = useState(today())
  const [qaBusy, setQaBusy] = useState(false)

  const tasks = db.tasks
  const open = tasks.filter(t => !isDone(t))
  const counts = {
    open: open.length,
    overdue: open.filter(t => { const d = daysUntil(t.due); return d !== null && d < 0 }).length,
    week: open.filter(t => { const d = daysUntil(t.due); return d !== null && d >= 0 && d <= 7 }).length,
    urgent: open.filter(t => t.priority === 'Urgent').length,
    done: tasks.length - open.length,
    all: tasks.length,
  }
  const LABEL = { open: 'Open', overdue: 'Overdue', week: 'Next 7 days', urgent: 'Urgent', done: 'Done', all: 'All' }

  const provOptions = useMemo(() => {
    const ids = [...new Set(tasks.map(t => t.provId).filter(Boolean))]
    return ids.map(id => ({ id, name: pname(db.providers, id) })).filter(o => o.name).sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks, db.providers])

  const q = search.trim().toLowerCase()
  const filtered = tasks.filter(t => {
    const d = daysUntil(t.due)
    if (filter === 'open' && isDone(t)) return false
    if (filter === 'overdue' && (isDone(t) || d === null || d >= 0)) return false
    if (filter === 'week' && (isDone(t) || d === null || d < 0 || d > 7)) return false
    if (filter === 'urgent' && (isDone(t) || t.priority !== 'Urgent')) return false
    if (filter === 'done' && !isDone(t)) return false
    if (fProv && t.provId !== fProv) return false
    if (q && !`${t.task} ${t.notes || ''} ${t.cat} ${pname(db.providers, t.provId)} ${db.payers.find(p => p.id === t.payId)?.name || ''}`.toLowerCase().includes(q)) return false
    return true
  })

  // Open work: soonest first, then by priority. Finished work: newest due date first.
  const sorted = [...filtered].sort((a, b) => {
    if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1
    const da = a.due || '9999-12-31', dbb = b.due || '9999-12-31'
    if (isDone(a)) return dbb.localeCompare(da)
    return da.localeCompare(dbb) || (PRI_RANK[a.priority] ?? 9) - (PRI_RANK[b.priority] ?? 9)
  })

  const groups = (filter === 'done' || filter === 'all')
    ? [{ key: 'flat', label: '', items: sorted }]
    : SECTION_ORDER.map(k => ({ key: k, label: SECTION_LABEL[k], items: sorted.filter(t => sectionOf(t) === k) })).filter(g => g.items.length)

  async function done(t) {
    setCompleting(prev => new Set([...prev, t.id]))
    await new Promise(r => setTimeout(r, 250))
    await handleMarkDone(t.id, t.task)
    setCompleting(prev => { const s = new Set(prev); s.delete(t.id); return s })
  }

  async function quickAdd(e) {
    e.preventDefault()
    if (!qaText.trim() || !qaDue || qaBusy) return
    setQaBusy(true)
    const ok = await handleQuickAdd({ task: qaText, due: qaDue, provId: fProv })
    setQaBusy(false)
    if (ok) setQaText('')
  }

  const filtersOn = !!(search || fProv)

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Tasks</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Credentialing follow-ups and to-dos. No patient information in task text.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => openTaskModal()}>+ New Task</button>
      </div>

      <form onSubmit={quickAdd} style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" value={qaText} onChange={e => setQaText(e.target.value)} placeholder="Quick add: what needs doing?" aria-label="Quick add task"
          style={{ flex: '1 1 260px', minWidth: 200, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13 }} />
        <DateInput value={qaDue} onChange={e => setQaDue(e.target.value)} style={{ width: 130 }} />
        <button className="btn btn-secondary btn-sm" type="submit" disabled={!qaText.trim() || !qaDue || qaBusy}>{qaBusy ? 'Adding…' : 'Add'}</button>
      </form>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 22, padding: 4, flexWrap: 'wrap' }}>
          {FILTERS.map(k => (
            <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12, borderRadius: 999 }} onClick={() => setFilter(k)}>
              {LABEL[k]} ({counts[k]})
            </button>
          ))}
        </div>
        <div className="search-box" style={{ maxWidth: 240 }}>
          <span className="si"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" />
        </div>
        <select className="filter-select" value={fProv} onChange={e => setFProv(e.target.value)}>
          <option value="">All providers</option>
          {provOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {filtersOn && <button onClick={() => { setSearch(''); setFProv('') }} style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear ×</button>}
      </div>

      {sorted.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">{filtersOn ? 'No matching tasks' : filter === 'open' ? 'No open tasks' : 'Nothing here'}</div>
          <div className="empty-state-desc">{filtersOn ? 'Try clearing the search or provider filter.' : filter === 'open' ? 'You’re all caught up.' : 'Nothing in this view.'}</div>
        </div>
      )}

      {groups.map(g => (
        <div key={g.key} style={{ marginBottom: 16 }}>
          {g.label && (
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: g.key === 'overdue' ? 'var(--danger)' : 'var(--text-4)', margin: '14px 0 8px' }}>
              {g.label} ({g.items.length})
            </div>
          )}
          {g.items.map(t => {
            const d = daysUntil(t.due)
            const fin = isDone(t)
            const busy = completing.has(t.id)
            const pn = pname(db.providers, t.provId)
            const payer = db.payers.find(p => p.id === t.payId)?.name
            const bar = fin ? 'var(--border)' : t.priority === 'Urgent' ? 'var(--red)' : t.priority === 'High' ? 'var(--amber-d)' : 'var(--primary)'
            return (
              <div key={t.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${bar}`, marginBottom: 7, opacity: busy ? .3 : fin ? .6 : 1, transition: 'opacity .25s' }}>
                <button type="button" disabled={fin || busy} onClick={() => done(t)} title={fin ? 'Completed' : 'Mark as done'} aria-label={fin ? 'Completed' : `Mark done: ${t.task}`}
                  style={{ width: 24, height: 24, borderRadius: '50%', border: fin ? '2px solid var(--green)' : '1.5px solid var(--border)', background: fin ? 'var(--green-l)' : 'transparent', color: fin ? 'var(--green-d)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: fin ? 'default' : 'pointer', flexShrink: 0, fontSize: 12, fontWeight: 800, fontFamily: 'inherit', padding: 0 }}>
                  {(fin || busy) ? '✓' : ''}
                </button>
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, textDecoration: fin ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{t.task}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {pn && (openProvDetail
                      ? <button type="button" onClick={() => openProvDetail(t.provId)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--pr)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>{pn}</button>
                      : <span style={{ color: 'var(--pr)' }}>{pn}</span>)}
                    {payer && <span>{payer}</span>}
                    <span>{t.cat}</span>
                    <span className={`badge ${t.priority === 'Urgent' ? 'b-red' : t.priority === 'High' ? 'b-amber' : 'b-gray'}`} style={{ fontSize: 10 }}>{t.priority}</span>
                    {!fin && t.status && t.status !== 'Open' && <span className="badge b-blue" style={{ fontSize: 10 }}>{t.status}</span>}
                  </div>
                  {t.notes && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  {t.due && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{fmtDate(t.due)}</span>}
                  {!fin && d !== null && (
                    <span className={`badge ${d <= 0 ? 'b-red' : d <= 3 ? 'b-amber' : 'b-gray'}`}>{d < 0 ? `${Math.abs(d)}d late` : d === 0 ? 'Today' : `${d}d`}</span>
                  )}
                  {fin && <button className="btn btn-xs btn-ghost" onClick={() => handleReopen(t.id)}>Reopen</button>}
                  <button className="btn btn-xs btn-ghost" onClick={() => openTaskModal(t.id)}>Edit</button>
                  <button className="btn btn-xs btn-danger" onClick={() => handleDeleteTask(t.id)} aria-label={`Delete ${t.task}`}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default TasksPage
