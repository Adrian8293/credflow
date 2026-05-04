import { useState } from 'react'

export function ProviderLookup({ db, setPage, setProvForm, setEditingId, setNpiInput, setNpiResult }) {
  const [activeTab, setActiveTab] = useState('nppes')

  // NPPES search state
  const [fname, setFname] = useState('')
  const [lname, setLname] = useState('')
  const [orgName, setOrgName] = useState('')
  const [npiNumber, setNpiNumber] = useState('')
  const [state, setState] = useState('OR')
  const [city, setCity] = useState('')
  const [zip, setZip] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [npiType, setNpiType] = useState('NPI-1')
  const [results, setResults] = useState(null)
  const [resultCount, setResultCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nppesModal, setNppesModal] = useState(null)  // holds full result record
  const [importing, setImporting] = useState(null)

  const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

  const SPECIALTIES = [
    'Clinical Social Worker','Licensed Professional Counselor','Marriage & Family Therapist',
    'Psychologist','Psychiatry','Naturopathic Medicine','Chiropractic',
    'Acupuncture','Massage Therapy','Mental Health Counselor','Nurse Practitioner',
    'Physician Assistant','Physical Therapist','Occupational Therapist',
  ]

  async function doSearch(e) {
    e && e.preventDefault()
    if (!npiNumber.trim() && !fname.trim() && !lname.trim() && !orgName.trim()) {
      setError('Enter an NPI number, a name, or an organization name.'); return
    }
    setLoading(true); setError(''); setResults(null); setNppesModal(null); setImporting(null)
    try {
      const params = new URLSearchParams()
      if (npiNumber.trim()) {
        params.append('number', npiNumber.trim())
      } else if (npiType === 'NPI-2') {
        if (orgName.trim()) params.append('organization_name', orgName.trim())
      } else {
        if (fname.trim()) params.append('first_name', fname.trim())
        if (lname.trim()) params.append('last_name',  lname.trim())
      }
      if (state)           params.append('state', state)
      if (city.trim())     params.append('city', city.trim())
      if (zip.trim())      params.append('zip', zip.trim())
      if (specialty)       params.append('taxonomy', specialty)
      if (!npiNumber.trim()) params.append('npi_type', npiType)
      const res = await fetch(`/api/npi-search?${params}`)
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setResults(data.results || [])
      setResultCount(data.resultCount || 0)
    } catch {
      setError('Could not reach the NPI registry. Please try again.')
    }
    setLoading(false)
  }

  function guessSpec(tax) {
    if (!tax) return 'Mental Health'
    const t = tax.toLowerCase()
    if (t.includes('social work') || t.includes('counselor') || t.includes('psycholog') || t.includes('mental') || t.includes('marriage') || t.includes('psychiatr')) return 'Mental Health'
    if (t.includes('naturo')) return 'Naturopathic'
    if (t.includes('chiroprac')) return 'Chiropractic'
    if (t.includes('acupunc')) return 'Acupuncture'
    if (t.includes('massage')) return 'Massage Therapy'
    return 'Mental Health'
  }

  function alreadyInSystem(npi) {
    return db.providers.some(p => p.npi === npi)
  }

  function importProvider(r) {
    setProvForm({
      fname:   r.fname,
      lname:   r.lname,
      cred:    r.credential || '',
      npi:     r.npi || '',
      phone:   r.phone || '',
      status:  'Active',
      spec:    guessSpec(r.taxonomyDesc),
      focus:   r.taxonomyDesc || '',
      license: r.taxonomyLicense || '',
    })
    setEditingId(e => ({ ...e, provider: null }))
    setNpiInput(r.npi || '')
    setNpiResult({ fname: r.fname, lname: r.lname, cred: r.credential, spec: r.taxonomyDesc, addr: r.address + (r.cityStateZip ? ', ' + r.cityStateZip : ''), npi: r.npi })
    setPage('add-provider')
  }


  // ── Info row helper for expanded panel ────────────────────────────────────
  function InfoRow({ label, value }) {
    if (!value) return null
    return (
      <div style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border-2)', fontSize: 12.5 }}>
        <span style={{ color: 'var(--ink-4)', width: 160, flexShrink: 0, fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--ink)', flex: 1 }}>{value}</span>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="lookup-tabs">
        <div className={`lookup-tab ${activeTab==='nppes'?'active':''}`} onClick={()=>setActiveTab('nppes')}>🔍 NPI Registry Search</div>
      </div>

      {/* ── TAB 1: NPPES SEARCH ── */}
      {activeTab === 'nppes' && (
        <div>
          <div className="card mb-16">
            <div className="card-header">
              <h3>Search NPPES National Provider Registry</h3>
              <span className="ch-meta">Live data from CMS · 8M+ providers · All fields from NPPES</span>
            </div>
            <div className="card-body">
              <form onSubmit={doSearch}>
                <div className="form-grid" style={{ marginBottom: 14 }}>
                  <div className="fg"><label>NPI Number</label><input type="text" value={npiNumber} onChange={e=>setNpiNumber(e.target.value)} placeholder="Direct NPI lookup" maxLength={10} /></div>
                  <div className="fg"><label>Provider Type</label>
                    <select value={npiType} onChange={e=>{ setNpiType(e.target.value); setFname(''); setLname(''); setOrgName('') }}>
                      <option value="NPI-1">Individual (NPI-1)</option>
                      <option value="NPI-2">Organization (NPI-2)</option>
                    </select>
                  </div>
                  {npiType === 'NPI-2'
                    ? <div className="fg full"><label>Organization Name</label><input type="text" value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="Positive Inner Self LLC" /></div>
                    : <>
                        <div className="fg"><label>First Name</label><input type="text" value={fname} onChange={e=>setFname(e.target.value)} placeholder="Sarah" /></div>
                        <div className="fg"><label>Last Name</label><input type="text" value={lname} onChange={e=>setLname(e.target.value)} placeholder="Chen" /></div>
                      </>
                  }
                  <div className="fg"><label>State</label>
                    <select value={state} onChange={e=>setState(e.target.value)}>
                      <option value="">All States</option>
                      {STATES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="fg"><label>City</label><input type="text" value={city} onChange={e=>setCity(e.target.value)} placeholder="Portland" /></div>
                  <div className="fg"><label>ZIP Code</label><input type="text" value={zip} onChange={e=>setZip(e.target.value)} placeholder="97201" maxLength={10} /></div>
                  <div className="fg"><label>Specialty / Taxonomy</label>
                    <select value={specialty} onChange={e=>setSpecialty(e.target.value)}>
                      <option value="">All Specialties</option>
                      {SPECIALTIES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {error && (
                  <div style={{ color:'var(--red)', background:'var(--red-l)', border:'1px solid var(--red-b)', borderRadius:'var(--r)', padding:'8px 12px', fontSize:12.5, marginBottom:12 }}>
                    {error}
                  </div>
                )}

                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? <><span className="spinner"></span> Searching NPPES…</> : '🔍 Search Registry'}
                  </button>
                  {results && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{setResults(null);setFname('');setLname('');setOrgName('');setNpiNumber('');setState('OR');setCity('');setZip('');setSpecialty('');setNppesModal(null)}}>
                      Clear
                    </button>
                  )}
                  <span style={{ fontSize:12, color:'var(--ink-4)', marginLeft:4 }}>Searches the official CMS NPPES database in real time</span>
                </div>
              </form>
            </div>
          </div>

          {/* Results */}
          {results !== null && (
            <div>
              <div className="lookup-count">
                {results.length === 0
                  ? 'No providers found. Try a broader search — use last name only, or remove state/city filters.'
                  : `Showing ${results.length} of ${resultCount.toLocaleString()} matches${resultCount > 25 ? ' — refine to narrow results' : ''}`
                }
              </div>

              {results.map((r, i) => {
                const inSystem = alreadyInSystem(r.npi)
                const isImporting = importing?.npi === r.npi
                const displayName = r.orgName || `${r.fname} ${r.mname ? r.mname + ' ' : ''}${r.lname}${r.suffix ? ' ' + r.suffix : ''}`

                return (
                  <div key={r.npi || i} className="lookup-result-card" style={{ display: 'block', padding: 0, overflow: 'hidden' }}>
                    {/* ── Collapsed header row ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, padding: '16px 20px', alignItems: 'start' }}>
                      {/* Avatar */}
                      <div className="lookup-avatar" style={{ background: r.npiStatus === 'Active' ? 'var(--primary-l)' : 'var(--surface-2)' }}>
                        {r.orgName ? '🏢' : `${(r.fname[0]||'?')}${(r.lname[0]||'')}`}
                      </div>

                      {/* Name + summary */}
                      <div>
                        <div className="lookup-name">
                          {displayName}{r.credential ? `, ${r.credential}` : ''}
                        </div>
                        <div className="lookup-meta">
                          {[r.taxonomyDesc, r.city && r.state ? `${r.city}, ${r.state}` : r.state].filter(Boolean).join(' · ')}
                        </div>
                        <div className="lookup-chips" style={{ marginTop: 6 }}>
                          <span className="info-chip">NPI {r.npi}</span>
                          <span className={`badge ${r.npiStatus === 'Active' ? 'b-green' : 'b-red'}`}>{r.npiStatus || 'Unknown'}</span>
                          <span className="badge b-gray">{r.enumType}</span>
                          {r.phone && <span className="info-chip">📞 {r.phone}</span>}
                          {r.taxonomyLicense && <span className="info-chip">Lic: {r.taxonomyLicense}</span>}
                          {r.gender && <span className="badge b-gray">{r.gender === 'M' ? 'Male' : r.gender === 'F' ? 'Female' : r.gender}</span>}
                          {inSystem && <span className="badge b-green">✓ In CredFlow</span>}
                        </div>

                      </div>

                      {/* Actions */}
                      <div className="lookup-actions">
                        {!inSystem ? (
                          <button
                            className={`btn btn-sm ${isImporting ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => isImporting ? setImporting(null) : setImporting(r)}
                          >
                            {isImporting ? 'Cancel' : '＋ Import'}
                          </button>
                        ) : (
                          <span className="badge b-green" style={{ fontSize: 11 }}>Already added</span>
                        )}
                        <a
                          href={`https://npiregistry.cms.hhs.gov/provider-view/${r.npi}`}
                          target="_blank" rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                        >
                          NPPES ↗
                        </a>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 12 }}
                          onClick={() => setNppesModal(r)}
                        >
                          View Full NPPES Record
                        </button>
                      </div>
                    </div>

                    {/* ── Import confirmation ── */}
                    {isImporting && (
                      <div className="import-preview" style={{ margin: '0 20px 16px' }}>
                        <div className="import-preview-title">Will be imported as:</div>
                        {[
                          ['Name', `${r.fname} ${r.lname}${r.credential ? ', ' + r.credential : ''}`],
                          ['NPI', r.npi],
                          ['Specialty', guessSpec(r.taxonomyDesc) + (r.taxonomyDesc ? ' (' + r.taxonomyDesc + ')' : '')],
                          ['License #', r.taxonomyLicense || '—'],
                          ['Phone', r.phone || '—'],
                          ['Address', [r.address, r.cityStateZip].filter(Boolean).join(', ') || '—'],
                        ].map(([label, val]) => (
                          <div key={label} className="import-row">
                            <span className="import-label">{label}</span>
                            <span className="import-val">{val}</span>
                          </div>
                        ))}
                        <div style={{ display:'flex', gap:8, marginTop:12 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => importProvider(r)}>✓ Confirm Import</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setImporting(null)}>Cancel</button>
                        </div>
                      </div>
                    )}

                  </div>
                )
              })}
            </div>
          )}

          {results === null && !loading && (
            <div className="empty-state">
              <div className="ei">🔍</div>
              <h4>Search the national provider registry</h4>
              <p style={{ maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
                Search 8M+ providers in the CMS NPPES database. Click <strong>Full NPPES Record</strong> on any result to view
                all taxonomies, addresses, identifiers, and enumeration dates.
                Import directly into CredFlow with one click.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── NPPES Full Record Modal ── */}
      {nppesModal && (() => {
        const r = nppesModal
        return (
          <>
            <div className="drawer-overlay open" onClick={() => setNppesModal(null)} />
            <div className="drawer">
              <div className="drawer-header">
                <div>
                  <h3>Full NPPES Record</h3>
                  <div className="mh-sub">
                    {r.orgName || `${r.fname} ${r.lname}${r.credential ? ', ' + r.credential : ''}`} · NPI {r.npi}
                  </div>
                </div>
                <button className="modal-close" onClick={() => setNppesModal(null)}>✕</button>
              </div>
              <div className="drawer-body">
                <div className="grid-2" style={{ gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--primary)', marginBottom: 8 }}>Identity</div>
                    <InfoRow label="NPI Number" value={r.npi} />
                    <InfoRow label="NPI Type" value={r.enumType} />
                    <InfoRow label="NPI Status" value={r.npiStatus} />
                    <InfoRow label="First Name" value={r.fname} />
                    <InfoRow label="Middle Name" value={r.mname} />
                    <InfoRow label="Last Name" value={r.lname} />
                    <InfoRow label="Suffix" value={r.suffix} />
                    <InfoRow label="Credential" value={r.credential} />
                    <InfoRow label="Gender" value={r.gender === 'M' ? 'Male' : r.gender === 'F' ? 'Female' : r.gender} />
                    <InfoRow label="Sole Proprietor" value={r.soloProprietor} />
                    {r.orgName && <InfoRow label="Organization Name" value={r.orgName} />}
                    {r.orgSubpart && <InfoRow label="Org Subpart" value={r.orgSubpart} />}
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--primary)', margin: '14px 0 8px' }}>Enumeration</div>
                    <InfoRow label="Enumeration Date" value={r.enumerationDate} />
                    <InfoRow label="Last Updated" value={r.lastUpdated} />
                    <InfoRow label="Certification Date" value={r.certificationDate} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--primary)', marginBottom: 8 }}>Practice Location</div>
                    <InfoRow label="Address 1" value={r.address1} />
                    <InfoRow label="Address 2" value={r.address2} />
                    <InfoRow label="City" value={r.city} />
                    <InfoRow label="State" value={r.state} />
                    <InfoRow label="ZIP" value={r.zip} />
                    <InfoRow label="Country" value={r.country} />
                    <InfoRow label="Phone" value={r.phone} />
                    <InfoRow label="Fax" value={r.fax} />
                    {r.mailCity && <>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--primary)', margin: '14px 0 8px' }}>Mailing Address</div>
                      <InfoRow label="Address" value={[r.mailAddress1, r.mailAddress2].filter(Boolean).join(', ')} />
                      <InfoRow label="City / State / ZIP" value={[r.mailCity, r.mailState, r.mailZip].filter(Boolean).join(', ')} />
                      <InfoRow label="Phone" value={r.mailPhone} />
                    </>}
                  </div>
                </div>

                {r.allTaxonomies?.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--primary)', marginBottom: 8 }}>Taxonomies / Specialties</div>
                    <div className="tbl-wrap">
                      <table>
                        <thead><tr>
                          <th className="no-sort">Code</th>
                          <th className="no-sort">Description</th>
                          <th className="no-sort">License #</th>
                          <th className="no-sort">State</th>
                          <th className="no-sort">Primary</th>
                        </tr></thead>
                        <tbody>
                          {r.allTaxonomies.map((t, ti) => (
                            <tr key={ti}>
                              <td><code style={{ fontSize: 11 }}>{t.code}</code></td>
                              <td style={{ fontSize: 12 }}>{t.desc}</td>
                              <td style={{ fontSize: 12 }}>{t.license || '—'}</td>
                              <td style={{ fontSize: 12 }}>{t.state || '—'}</td>
                              <td>{t.primary && <span className="badge b-green" style={{ fontSize: 10 }}>Primary</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {r.identifiers?.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--primary)', marginBottom: 8 }}>Other Identifiers</div>
                    <div className="tbl-wrap">
                      <table>
                        <thead><tr>
                          <th className="no-sort">Type</th>
                          <th className="no-sort">Identifier</th>
                          <th className="no-sort">State</th>
                          <th className="no-sort">Issuer</th>
                        </tr></thead>
                        <tbody>
                          {r.identifiers.map((id, ii) => (
                            <tr key={ii}>
                              <td style={{ fontSize: 12 }}>{id.desc || id.code}</td>
                              <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{id.identifier}</td>
                              <td style={{ fontSize: 12 }}>{id.state || '—'}</td>
                              <td style={{ fontSize: 12 }}>{id.issuer || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {r.otherNames?.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--primary)', marginBottom: 8 }}>Other / Former Names</div>
                    {r.otherNames.map((n, ni) => (
                      <div key={ni} style={{ fontSize: 12, color: 'var(--ink-3)', padding: '4px 0' }}>
                        {[n.fname, n.lname].filter(Boolean).join(' ')} {n.type ? `(${n.type})` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )

  function guessSpec(tax) {
    if (!tax) return 'Mental Health'
    const t = tax.toLowerCase()
    if (t.includes('social work') || t.includes('counselor') || t.includes('psycholog') || t.includes('mental') || t.includes('marriage') || t.includes('psychiatr')) return 'Mental Health'
    if (t.includes('naturo')) return 'Naturopathic'
    if (t.includes('chiroprac')) return 'Chiropractic'
    if (t.includes('acupunc')) return 'Acupuncture'
    if (t.includes('massage')) return 'Massage Therapy'
    return 'Mental Health'
  }
}


// ─── LICENSE VERIFICATION PAGE ───────────────────────────────────────────────

export { ProviderLookup }
