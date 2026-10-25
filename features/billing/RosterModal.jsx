/**
 * RosterModal — pick a group and a payer, preview the roster, download the CSV.
 * Reads the group's location and contract from the Groups records so nothing is typed twice.
 */
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { fetchEntities, fetchLocations, fetchContracts } from '../../lib/db'
import { buildRoster, rosterCsv } from '../../lib/roster.js'
import { downloadCsv } from '../../lib/csv.js'

export function RosterModal({ db, onClose, onSwitch }) {
  const [entities, setEntities] = useState(null)       // null = loading
  const [entityId, setEntityId] = useState('')
  const [payerId, setPayerId] = useState('')
  const [includePending, setIncludePending] = useState(false)
  const [locations, setLocations] = useState([])
  const [contracts, setContracts] = useState([])

  useEffect(() => {
    let live = true
    fetchEntities().then(e => { if (live) { setEntities(e); if (e.length === 1) setEntityId(e[0].id) } }).catch(() => live && setEntities([]))
    return () => { live = false }
  }, [])
  useEffect(() => {
    if (!entityId) { setLocations([]); setContracts([]); return }
    let live = true
    Promise.all([fetchLocations(entityId), fetchContracts(entityId)])
      .then(([l, c]) => { if (live) { setLocations(l); setContracts(c) } }).catch(() => {})
    return () => { live = false }
  }, [entityId])

  const entity = (entities || []).find(e => e.id === entityId) || null
  const contract = contracts.find(c => c.payerId === payerId) || null
  const payers = [...db.payers].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const roster = useMemo(
    () => (payerId ? buildRoster(db, { payerId, entity, locations, contract, includePending }) : null),
    [db, payerId, entity, locations, contract, includePending])
  const payerName = payers.find(p => p.id === payerId)?.name || 'payer'

  function download() {
    if (!roster?.rows.length) return
    const day = new Date().toISOString().slice(0, 10)
    downloadCsv(`roster-${payerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${day}.csv`, rosterCsv(roster.rows))
  }

  return (
    <Modal title="Payer roster" sub="The provider list a payer asks for" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" disabled={!roster?.rows.length} onClick={download}>
          Download CSV{roster?.rows.length ? ` (${roster.rows.length})` : ''}
        </button>
      </>}>
      {onSwitch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', marginBottom: 14, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--text-2)' }}>
          <span>Did the payer send an Excel form to complete?</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onSwitch}>Fill their form instead</button>
        </div>
      )}
      <div className="form-grid">
        <div className="fg">
          <label>Group</label>
          <select value={entityId} onChange={e => setEntityId(e.target.value)}>
            <option value="">{entities === null ? 'Loading…' : entities.length ? 'Choose a group…' : 'No groups yet (add one on Groups)'}</option>
            {(entities || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Payer</label>
          <select value={payerId} onChange={e => setPayerId(e.target.value)}>
            <option value="">Choose a payer…</option>
            {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="fg full">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <input type="checkbox" checked={includePending} onChange={e => setIncludePending(e.target.checked)} style={{ width: 20, height: 20 }} />
            Also include providers whose application is still in progress
          </label>
        </div>
      </div>

      {roster && (
        <div style={{ marginTop: 14 }}>
          {roster.providerCount === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
              No providers are enrolled with {payerName}{includePending ? '' : ' yet (active or waiting on an effective date)'}. {!includePending && 'Tick the box above to include applications in progress.'}
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>
                {roster.providerCount} provider{roster.providerCount === 1 ? '' : 's'} on the {payerName} roster
              </p>
              {roster.missing.length > 0 ? (
                <div style={{ background: 'var(--amber-l, #fffbeb)', border: '1px solid var(--amber-b, #fde68a)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                  <b>Still missing for {roster.missing.length} provider{roster.missing.length === 1 ? '' : 's'}</b> (payers usually reject rosters without these):
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {roster.missing.slice(0, 8).map(m => <li key={m.name}><b>{m.name}</b>: {m.fields.join(', ')}</li>)}
                    {roster.missing.length > 8 && <li>…and {roster.missing.length - 8} more (see the “Still missing” column in the file)</li>}
                  </ul>
                </div>
              ) : <p style={{ fontSize: 13, color: 'var(--green-d, #047857)', margin: 0 }}>Nothing missing. This roster is complete.</p>}
              <p style={{ fontSize: 12, color: 'var(--text-4)', margin: '10px 0 0' }}>
                The full tax ID isn’t stored in Lacentra, so that column is blank for you to fill in. Every payer has its own roster layout; use this as the data and copy it into theirs.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
