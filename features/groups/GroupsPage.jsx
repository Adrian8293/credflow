import { useEffect, useMemo, useState, useCallback } from 'react'
import { DrawerModal } from '../../components/ui/Modal.jsx'
import { fmtDate, pNameShort, payName } from '../../lib/helpers.js'
import {
  fetchEntities, upsertEntity, fetchContracts, upsertContract, deleteContract,
  fetchLocations, upsertLocation, deleteLocation, upsertEnrollment,
} from '../../lib/db'
import { PRODUCT_LINES, STATES, ASSOCIATE_MODES } from '../../constants/enrollmentOptions.js'
import { DateInput } from '../../components/ui/DateInput.jsx'

const ENTITY_TYPES = ['LLC', 'PLLC', 'PC', 'MSO', 'Other']
const MIGRATION_MSG = 'Groups need supabase-migration-013-legal-entities.sql (run 012 first). Run it in the Supabase SQL editor, then refresh.'
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16 }
const label = { fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--text-4)' }

// Only blame a missing migration when the database says the table doesn't exist.
function explain(e) {
  const missing = /42P01|does not exist|schema cache|relation/i.test(`${e?.code} ${e?.message}`)
  return missing ? MIGRATION_MSG : `Could not load groups: ${e?.message || 'unknown error'}. Check your connection and refresh.`
}

function isMedicaid(contract, payer) {
  return contract.productLine === 'Medicaid' || payer?.type === 'Medicaid'
}

export function GroupsPage({ db, setDb, toast, openEnrollModal }) {
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selId, setSelId] = useState('')
  const [tab, setTab] = useState('roster')
  const [entityForm, setEntityForm] = useState(null)
  const [contracts, setContracts] = useState([])
  const [locations, setLocations] = useState([])
  const [contractForm, setContractForm] = useState(null)
  const [locForm, setLocForm] = useState(null)
  const [onboard, setOnboard] = useState(null) // contract being onboarded
  const [picked, setPicked] = useState({})
  const [busy, setBusy] = useState(false)

  const entity = entities.find(e => e.id === selId) || null

  const loadEntities = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const list = await fetchEntities()
      setEntities(list)
      setSelId(prev => prev || list[0]?.id || '')
    } catch (e) { setError(explain(e)) }
    setLoading(false)
  }, [])
  useEffect(() => { loadEntities() }, [loadEntities])

  const loadChildren = useCallback(async (id) => {
    if (!id) { setContracts([]); setLocations([]); return }
    try { const [c, l] = await Promise.all([fetchContracts(id), fetchLocations(id)]); setContracts(c); setLocations(l) }
    catch (e) { setError(explain(e)) }
  }, [])
  useEffect(() => { loadChildren(selId) }, [selId, loadChildren])

  const linked = useMemo(() => db.enrollments.filter(e => e.entityId && e.entityId === selId), [db.enrollments, selId])
  const roster = useMemo(() => {
    const byProv = new Map()
    linked.forEach(e => { if (!byProv.has(e.provId)) byProv.set(e.provId, []); byProv.get(e.provId).push(e) })
    return [...byProv.entries()].map(([provId, enrs]) => ({ provId, enrs, prov: db.providers.find(p => p.id === provId) }))
  }, [linked, db.providers])

  async function saveEntity() {
    if (!entityForm.name.trim()) return
    if (entityForm.einLast4 && !/^\d{4}$/.test(entityForm.einLast4)) { toast('EIN: enter only the last 4 digits.', 'error'); return }
    if (entityForm.type2Npi && !/^\d{10}$/.test(entityForm.type2Npi)) { toast('Type 2 NPI must be 10 digits.', 'error'); return }
    setBusy(true)
    try { const saved = await upsertEntity(entityForm); await loadEntities(); setSelId(saved.id); setEntityForm(null); toast('Group saved.', 'success') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  async function saveContract() {
    if (!contractForm.payerId) { toast('Choose a payer.', 'error'); return }
    setBusy(true)
    try { await upsertContract({ ...contractForm, entityId: selId }); await loadChildren(selId); setContractForm(null); toast('Contract saved.', 'success') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  async function removeContract(id) {
    if (!window.confirm('Delete this contract? Linked enrollments keep their data but lose the contract link.')) return
    try { await deleteContract(id, (() => { const c = contracts.find(x => x.id === id); return c ? `${payName(db.payers, c.payerId)} ${[c.state, c.productLine].filter(Boolean).join(' ')}`.trim() : undefined })()); await loadChildren(selId) } catch (err) { toast(err.message, 'error') }
  }
  async function saveLocation() {
    if (!locForm.name.trim()) return
    setBusy(true)
    try { await upsertLocation({ ...locForm, entityId: selId }); await loadChildren(selId); setLocForm(null) }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  async function removeLocation(id) {
    if (!window.confirm('Delete this location?')) return
    try { await deleteLocation(id, locations.find(x => x.id === id)?.name); await loadChildren(selId) } catch (err) { toast(err.message, 'error') }
  }

  // Bulk onboarding: create Not Started enrollments under a contract for the chosen providers.
  const onboardPayer = onboard ? db.payers.find(p => p.id === onboard.payerId) : null
  const medicaidBlock = onboard ? isMedicaid(onboard, onboardPayer) : false
  const candidates = onboard ? db.providers.filter(p => p.status !== 'Inactive' && !db.enrollments.some(e => e.provId === p.id && e.payId === onboard.payerId && e.entityId === selId)) : []

  async function runOnboard() {
    const ids = Object.keys(picked).filter(k => picked[k])
    if (!ids.length) return
    setBusy(true)
    const created = []
    try {
      for (const provId of ids) {
        const prov = db.providers.find(p => p.id === provId)
        const supervised = !!prov?.supervisor
        const saved = await upsertEnrollment({
          provId, payId: onboard.payerId, stage: 'Not Started', eft: 'Not Set Up', era: 'Not Set Up', contract: 'No',
          level: 'Group', groupName: entity.name, groupNpi: entity.type2Npi, entityId: selId, contractId: onboard.id,
          state: onboard.state, productLine: onboard.productLine, contractEffective: onboard.contractEffective,
          associateMode: supervised ? (onboard.associatePolicy || 'Unverified') : '',
        }, pNameShort(db.providers, provId), payName(db.payers, onboard.payerId))
        created.push(saved)
      }
      setDb(prev => ({ ...prev, enrollments: [...prev.enrollments, ...created] }))
      toast(`${created.length} enrollment${created.length === 1 ? '' : 's'} created.`, 'success')
      setOnboard(null); setPicked({})
    } catch (err) {
      if (created.length) setDb(prev => ({ ...prev, enrollments: [...prev.enrollments, ...created] }))
      toast(`Stopped after ${created.length}: ${err.message}`, 'error')
    } finally { setBusy(false) }
  }

  const f = (form, setForm) => ({ val: k => form[k] ?? '', set: (k, v) => setForm(p => ({ ...p, [k]: v })) })

  if (loading) return <div className="page"><div className="text-muted">Loading groups…</div></div>

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Groups</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Your legal entities, payer contracts and the providers enrolled under them. Individual enrollments stay on the Applications page.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {entities.length > 1 && (
            <select className="filter-select" value={selId} onChange={e => setSelId(e.target.value)}>{entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          )}
          <button className="btn btn-primary" onClick={() => setEntityForm({ name: '', entityType: 'LLC', stateOfFormation: 'OR', holdsCoa: false })}>+ Add Group</button>
        </div>
      </div>

      {error && <div style={{ ...card, color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {!entity && !error && (
        <div className="empty-state">
          <div className="empty-state-title">No group yet</div>
          <div className="empty-state-desc">Add your practice entity (for example Positive Inner Self, LLC) to track its payer contracts and roster.</div>
        </div>
      )}

      {entity && (
        <>
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{entity.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
                {entity.entityType}{entity.stateOfFormation ? ` · ${entity.stateOfFormation}` : ''}
                {entity.einLast4 ? ` · EIN ••${entity.einLast4}` : ''}{entity.type2Npi ? ` · Type 2 NPI ${entity.type2Npi}` : ' · No Type 2 NPI entered'}
              </div>
              <div style={{ marginTop: 8 }}>
                <span className={`badge ${entity.holdsCoa ? 'b-blue' : 'b-gray'}`}>{entity.holdsCoa ? 'Holds Oregon COA' : 'No Oregon COA'}</span>
                {!entity.holdsCoa && <span style={{ fontSize: 11.5, color: 'var(--text-4)', marginLeft: 8 }}>Eligible for Moda’s associate program. Verify OHP/CCO associate rules with OHA before any associate sees Medicaid patients.</span>}
              </div>
            </div>
            <div><button className="btn btn-secondary" onClick={() => setEntityForm({ ...entity })}>Edit group</button></div>
          </div>

          <div className="tabs">
            {[['roster', `Roster (${roster.length})`], ['contracts', `Contracts (${contracts.length})`], ['locations', `Locations (${locations.length})`]].map(([k, l]) => (
              <div key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</div>
            ))}
          </div>

          {tab === 'roster' && (
            roster.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No providers linked yet</div>
                <div className="empty-state-desc">Open the Contracts tab and use “Add providers” on a payer contract, or choose this group when editing a group enrollment.</div></div>
            ) : (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead><tr><th>Provider</th><th>Payer enrollments under this group</th></tr></thead>
                  <tbody>
                    {roster.map(r => (
                      <tr key={r.provId}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600 }}>{pNameShort(db.providers, r.provId)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.prov?.cred || ''}{r.prov?.supervisor ? ' · supervised' : ''}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {r.enrs.map(e => (
                              <button key={e.id} className="btn btn-sm btn-secondary" onClick={() => openEnrollModal(e.id)} title="Open enrollment">
                                {payName(db.payers, e.payId)} · {e.stage}{e.billableFrom ? ` · billable ${fmtDate(e.billableFrom)}` : ''}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'contracts' && (
            <>
              <div style={{ marginBottom: 12 }}><button className="btn btn-secondary" onClick={() => setContractForm({ payerId: '', state: 'OR', productLine: '', delegated: false, associatePolicy: 'Unverified' })}>+ Add payer contract</button></div>
              {contracts.length === 0 ? <div className="empty-state"><div className="empty-state-title">No contracts yet</div><div className="empty-state-desc">Add one per payer, state and product. Not every payer contracts with groups, so only add the ones that do.</div></div> : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {contracts.map(c => {
                    const payer = db.payers.find(p => p.id === c.payerId)
                    return (
                      <div key={c.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{payer?.name || 'Unknown payer'} <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>{[c.state, c.productLine].filter(Boolean).join(' · ')}</span></div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                            {c.contractNo ? `Contract ${c.contractNo} · ` : ''}{c.contractEffective ? `effective ${fmtDate(c.contractEffective)}` : 'no effective date'}{c.termDate ? ` · term ${fmtDate(c.termDate)}` : ''}
                            {c.delegated ? ' · delegated credentialing' : ''}{c.rosterCadence ? ` · roster ${c.rosterCadence}` : ''}{c.lastRosterSent ? ` (last sent ${fmtDate(c.lastRosterSent)})` : ''}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Associates: {c.associatePolicy || 'Unverified'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <button className="btn btn-sm btn-primary" onClick={() => { setOnboard(c); setPicked({}) }}>Add providers</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setContractForm({ ...c })}>Edit</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => removeContract(c.id)}>Delete</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'locations' && (
            <>
              <div style={{ marginBottom: 12 }}><button className="btn btn-secondary" onClick={() => setLocForm({ name: '', state: 'OR' })}>+ Add location</button></div>
              {locations.length === 0 ? <div className="empty-state"><div className="empty-state-title">No locations yet</div><div className="empty-state-desc">Add each service location. Its address and taxonomy must match what is on file with NPPES and each payer.</div></div> : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {locations.map(l => (
                    <div key={l.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{l.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{[l.address, l.city, l.state, l.zip].filter(Boolean).join(', ')}{l.taxonomy ? ` · taxonomy ${l.taxonomy}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => setLocForm({ ...l })}>Edit</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => removeLocation(l.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {entityForm && (() => { const { val, set } = f(entityForm, setEntityForm); return (
        <DrawerModal title={entityForm.id ? 'Edit Group' : 'Add Group'} onClose={() => setEntityForm(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setEntityForm(null)}>Cancel</button><button className="btn btn-primary" onClick={saveEntity} disabled={busy || !val('name').trim()}>{busy ? 'Saving…' : 'Save group'}</button></>}>
          <div className="form-grid">
            <div className="fg full"><label>Legal name</label><input value={val('name')} onChange={e => set('name', e.target.value)} placeholder="Positive Inner Self, LLC" /></div>
            <div className="fg"><label>Entity type</label><select value={val('entityType')} onChange={e => set('entityType', e.target.value)}>{ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="fg"><label>State of formation</label><select value={val('stateOfFormation')} onChange={e => set('stateOfFormation', e.target.value)}><option value="">—</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="fg"><label>EIN (last 4 digits only)</label><input value={val('einLast4')} maxLength={4} inputMode="numeric" onChange={e => set('einLast4', e.target.value.replace(/\D/g, ''))} /></div>
            <div className="fg"><label>Type 2 NPI</label><input value={val('type2Npi')} maxLength={10} inputMode="numeric" onChange={e => set('type2Npi', e.target.value.replace(/\D/g, ''))} /></div>
            <div className="fg full"><label>Oregon Certificate of Approval (COA)</label>
              <select value={entityForm.holdsCoa ? 'yes' : 'no'} onChange={e => set('holdsCoa', e.target.value === 'yes')}><option value="no">Does not hold a COA</option><option value="yes">Holds a COA</option></select>
            </div>
            <div className="fg full"><label>Notes</label><textarea value={val('notes')} onChange={e => set('notes', e.target.value)} /></div>
          </div>
        </DrawerModal>) })()}

      {contractForm && (() => { const { val, set } = f(contractForm, setContractForm); return (
        <DrawerModal title={contractForm.id ? 'Edit Contract' : 'Add Payer Contract'} onClose={() => setContractForm(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setContractForm(null)}>Cancel</button><button className="btn btn-primary" onClick={saveContract} disabled={busy}>{busy ? 'Saving…' : 'Save contract'}</button></>}>
          <div className="form-grid">
            <div className="fg full"><label>Payer</label>
              <select value={val('payerId')} onChange={e => set('payerId', e.target.value)}><option value="">— Select payer —</option>
                {db.payers.filter(p => (p.enrollmentModel || 'Individual + Group') !== 'Individual only').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Payers set to “Individual only” are hidden here.</div>
            </div>
            <div className="fg"><label>State</label><select value={val('state')} onChange={e => set('state', e.target.value)}><option value="">—</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="fg"><label>Product line</label><select value={val('productLine')} onChange={e => set('productLine', e.target.value)}><option value="">—</option>{PRODUCT_LINES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="fg"><label>Contract #</label><input value={val('contractNo')} onChange={e => set('contractNo', e.target.value)} /></div>
            <div className="fg"><label>Contract effective</label><DateInput  value={val('contractEffective')} onChange={e => set('contractEffective', e.target.value)} /></div>
            <div className="fg"><label>Term date</label><DateInput  value={val('termDate')} onChange={e => set('termDate', e.target.value)} /></div>
            <div className="fg"><label>Roster cadence</label><input value={val('rosterCadence')} onChange={e => set('rosterCadence', e.target.value)} placeholder="e.g. quarterly" /></div>
            <div className="fg"><label>Last roster sent</label><DateInput value={val('lastRosterSent')} onChange={e => set('lastRosterSent', e.target.value)} /></div>
            <div className="fg"><label>Delegated credentialing</label><select value={contractForm.delegated ? 'yes' : 'no'} onChange={e => set('delegated', e.target.value === 'yes')}><option value="no">No</option><option value="yes">Yes</option></select></div>
            <div className="fg"><label>Associate policy</label><select value={val('associatePolicy') || 'Unverified'} onChange={e => set('associatePolicy', e.target.value)}>{ASSOCIATE_MODES.map(m => <option key={m}>{m}</option>)}</select></div>
            <div className="fg full"><label>Notes</label><textarea value={val('notes')} onChange={e => set('notes', e.target.value)} /></div>
          </div>
        </DrawerModal>) })()}

      {locForm && (() => { const { val, set } = f(locForm, setLocForm); return (
        <DrawerModal title={locForm.id ? 'Edit Location' : 'Add Location'} onClose={() => setLocForm(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setLocForm(null)}>Cancel</button><button className="btn btn-primary" onClick={saveLocation} disabled={busy || !val('name').trim()}>{busy ? 'Saving…' : 'Save location'}</button></>}>
          <div className="form-grid">
            <div className="fg full"><label>Name</label><input value={val('name')} onChange={e => set('name', e.target.value)} placeholder="Main office" /></div>
            <div className="fg full"><label>Address</label><input value={val('address')} onChange={e => set('address', e.target.value)} /></div>
            <div className="fg"><label>City</label><input value={val('city')} onChange={e => set('city', e.target.value)} /></div>
            <div className="fg"><label>State</label><select value={val('state')} onChange={e => set('state', e.target.value)}><option value="">—</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="fg"><label>ZIP</label><input value={val('zip')} onChange={e => set('zip', e.target.value)} /></div>
            <div className="fg"><label>Taxonomy code</label><input value={val('taxonomy')} onChange={e => set('taxonomy', e.target.value)} /></div>
          </div>
        </DrawerModal>) })()}

      {onboard && (
        <DrawerModal title="Add providers to contract" sub={`${payName(db.payers, onboard.payerId)} · ${[onboard.state, onboard.productLine].filter(Boolean).join(' · ')}`} onClose={() => setOnboard(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setOnboard(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={runOnboard} disabled={busy || !Object.values(picked).some(Boolean)}>{busy ? 'Creating…' : `Create ${Object.values(picked).filter(Boolean).length || ''} enrollment(s)`}</button></>}>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>Creates a “Not Started” group enrollment for each selected provider. Providers who already have an enrollment with this payer under this group are not listed.</p>
          {medicaidBlock && <div style={{ fontSize: 12, color: 'var(--amber)', background: 'rgba(180,83,9,.08)', border: '1px solid rgba(180,83,9,.25)', borderRadius: 'var(--r)', padding: '8px 10px', marginBottom: 12 }}>Medicaid contract: supervised (pre-licensed) providers are disabled because associates do not see Medicaid patients at this practice.</div>}
          {candidates.length === 0 ? <div className="text-muted">Every provider already has an enrollment with this payer under this group.</div> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {candidates.map(p => {
                const blocked = medicaidBlock && !!p.supervisor
                return (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', opacity: blocked ? .5 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}>
                    <input type="checkbox" disabled={blocked} checked={!!picked[p.id]} onChange={e => setPicked(s => ({ ...s, [p.id]: e.target.checked }))} />
                    <span style={{ fontWeight: 600 }}>{p.fname} {p.lname}{p.cred ? `, ${p.cred}` : ''}</span>
                    {p.supervisor && <span className="badge b-amber">supervised</span>}
                  </label>
                )
              })}
            </div>
          )}
        </DrawerModal>
      )}
    </div>
  )
}
