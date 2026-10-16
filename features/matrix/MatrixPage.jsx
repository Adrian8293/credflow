import { useMemo, useState } from 'react'
import { pNameShort } from '../../lib/helpers.js'
import { enrollmentStatus, bestStatus, STATUS_META, todayStr } from '../../lib/matrix.js'
import { PRODUCT_LINES, STATES } from '../../constants/enrollmentOptions.js'

function exportCSV(rows, payers) {
  const head = ['Provider', ...payers.map(p => p.name)]
  const lines = [head, ...rows.map(r => [r.name, ...payers.map(p => (r.cells[p.id]?.label || ''))])]
  const csv = lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `provider-payer-matrix-${todayStr()}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function MatrixPage({ db, openEnrollModal }) {
  const [fState, setFState] = useState('')
  const [fProduct, setFProduct] = useState('')
  const [fLevel, setFLevel] = useState('')
  const [onlyBillable, setOnlyBillable] = useState(false)
  const [allPayers, setAllPayers] = useState(false)
  const today = todayStr()

  const enrollments = useMemo(() => db.enrollments.filter(e =>
    (!fState || e.state === fState) && (!fProduct || e.productLine === fProduct) && (!fLevel || (e.level || 'Individual') === fLevel)
  ), [db.enrollments, fState, fProduct, fLevel])

  const payers = useMemo(() => {
    const used = new Set(enrollments.map(e => e.payId))
    return db.payers.filter(p => allPayers || used.has(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [db.payers, enrollments, allPayers])

  const rows = useMemo(() => db.providers.map(p => {
    const cells = {}
    payers.forEach(pay => {
      const list = enrollments.filter(e => e.provId === p.id && e.payId === pay.id)
      if (!list.length) return
      const sts = list.map(e => ({ e, ...enrollmentStatus(e, today) }))
      const best = bestStatus(sts)
      cells[pay.id] = { list: sts, best, label: STATUS_META[best.key].label }
    })
    return { prov: p, name: pNameShort(db.providers, p.id), cells }
  }).filter(r => !onlyBillable || Object.values(r.cells).some(c => c.best.key === 'billable')), [db.providers, payers, enrollments, today, onlyBillable])

  const billableCount = pay => rows.filter(r => r.cells[pay.id]?.best.key === 'billable').length

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Billing Matrix</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Who can bill which payer today. Click a cell to open the enrollment, or an empty cell to start one.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => exportCSV(rows, payers)}>Export CSV</button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <select className="filter-select" value={fState} onChange={e => setFState(e.target.value)}><option value="">All states</option>{STATES.map(s => <option key={s}>{s}</option>)}</select>
        <select className="filter-select" value={fProduct} onChange={e => setFProduct(e.target.value)}><option value="">All products</option>{PRODUCT_LINES.map(s => <option key={s}>{s}</option>)}</select>
        <select className="filter-select" value={fLevel} onChange={e => setFLevel(e.target.value)}><option value="">Individual + Group</option><option value="Individual">Individual only</option><option value="Group">Group only</option></select>
        <label style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyBillable} onChange={e => setOnlyBillable(e.target.checked)} /> Billable providers only</label>
        <label style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={allPayers} onChange={e => setAllPayers(e.target.checked)} /> Show all payers</label>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {Object.entries(STATUS_META).map(([k, m]) => (
          <span key={k} style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: m.color }} />{m.label}
          </span>
        ))}
      </div>

      {payers.length === 0 || rows.length === 0 ? (
        <div className="empty-state"><div className="empty-state-title">Nothing to show</div><div className="empty-state-desc">No enrollments match these filters.</div></div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--card)', textAlign: 'left', padding: '10px 14px', fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)', minWidth: 170 }}>Provider</th>
                {payers.map(p => (
                  <th key={p.id} style={{ padding: '10px 10px', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', borderBottom: '1px solid var(--border)', minWidth: 120, textAlign: 'center', verticalAlign: 'bottom' }}>
                    <div>{p.name}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text-4)' }}>{(p.enrollmentModel && p.enrollmentModel !== 'Individual + Group') ? p.enrollmentModel : ' '}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--green)' }}>{billableCount(p)} billable</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.prov.id}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--card)', padding: '8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.prov.cred}{r.prov.supervisor ? ' · supervised' : ''}</div>
                  </td>
                  {payers.map(pay => {
                    const c = r.cells[pay.id]
                    if (!c) return (
                      <td key={pay.id} style={{ padding: 4, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                        <button onClick={() => openEnrollModal(null, r.prov.id, pay.id)} aria-label={`Start enrollment: ${r.name} with ${pay.name}`}
                          style={{ width: '100%', minHeight: 40, background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r)', color: 'var(--text-4)', cursor: 'pointer', fontSize: 14 }}>+</button>
                      </td>
                    )
                    const m = STATUS_META[c.best.key]
                    return (
                      <td key={pay.id} style={{ padding: 4, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gap: 3 }}>
                          {c.list.slice(0, 2).map(({ e, key, note }) => {
                            const mm = STATUS_META[key]
                            return (
                              <button key={e.id} onClick={() => openEnrollModal(e.id)} title={[e.stage, note, e.state, e.productLine, e.associateMode && `Associate: ${e.associateMode}`].filter(Boolean).join(' · ')}
                                style={{ width: '100%', textAlign: 'left', background: mm.bg, color: mm.color, border: 'none', borderRadius: 'var(--r)', padding: '5px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                <div style={{ fontSize: 11.5, fontWeight: 700 }}>{mm.label}</div>
                                <div style={{ fontSize: 10.5, opacity: .85 }}>{(e.level === 'Group' ? 'Group' : 'Indiv')}{e.state ? ` · ${e.state}` : ''}{e.productLine ? ` · ${e.productLine}` : ''}</div>
                              </button>
                            )
                          })}
                          {c.list.length > 2 && <div style={{ fontSize: 10.5, color: 'var(--text-4)', textAlign: 'center' }}>+{c.list.length - 2} more</div>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
