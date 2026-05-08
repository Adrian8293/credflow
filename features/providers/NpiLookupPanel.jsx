import { useState } from 'react'

export function NpiLookupPanel({ npiInput, setNpiInput, npiResult, setNpiResult, npiLoading, lookupNPI, setProvForm }) {
  const [mode, setMode] = useState('number') // 'number' | 'name'
  const [fname, setFname] = useState('')
  const [lname, setLname] = useState('')
  const [state, setState] = useState('OR')
  const [nameResults, setNameResults] = useState(null)
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError, setNameError] = useState('')
  const [selected, setSelected] = useState(null)

  const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

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

  async function searchByName(e) {
    e && e.preventDefault()
    if (!fname.trim() && !lname.trim()) { setNameError('Enter at least a first or last name.'); return }
    setNameLoading(true); setNameError(''); setNameResults(null); setSelected(null)
    try {
      const params = new URLSearchParams()
      if (fname.trim()) params.append('first_name', fname.trim())
      if (lname.trim()) params.append('last_name', lname.trim())
      if (state) params.append('state', state)
      params.append('limit', '15')
      const res = await fetch(`/api/npi-search?${params}`)
      const data = await res.json()
      if (data.error) { setNameError(data.error); setNameLoading(false); return }
      setNameResults(data.results || [])
    } catch {
      setNameError('Could not reach NPI registry. Try again.')
    }
    setNameLoading(false)
  }

  function applyResult(r) {
    setSelected(r.npi)
    setNpiInput(r.npi)
    setNpiResult({
      fname: r.fname, lname: r.lname,
      cred: r.credential, spec: r.taxonomyDesc,
      addr: [r.address, r.cityStateZip].filter(Boolean).join(', '),
      npi: r.npi,
    })
    setProvForm(f => ({
      ...f,
      fname:   f.fname   || r.fname,
      lname:   f.lname   || r.lname,
      cred:    f.cred    || r.credential || '',
      npi:     r.npi,
      phone:   f.phone   || r.phone || '',
      spec:    f.spec    || guessSpec(r.taxonomyDesc),
      focus:   f.focus   || r.taxonomyDesc || '',
      license: f.license || r.taxonomyLicense || '',
    }))
  }

  return (
    <div className="mb-16 fg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <label style={{ margin: 0, fontWeight: 600 }}>🔍 NPI Registry Lookup</label>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: 3 }}>
          {[['number','By NPI #'],['name','By Name']].map(([k, l]) => (
            <button
              key={k}
              className={`btn btn-sm ${mode === k ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '4px 12px', fontSize: 11.5, borderRadius: 999 }}
              onClick={() => { setMode(k); setNameResults(null); setNameError(''); setSelected(null) }}
            >{l}</button>
          ))}
        </div>
      </div>

      {/* ── Mode A: By NPI Number ── */}
      {mode === 'number' && (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text" value={npiInput}
              onChange={e => setNpiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupNPI()}
              placeholder="Enter 10-digit NPI number…"
              maxLength={10} style={{ flex: 1 }}
            />
            <button className="btn btn-green" onClick={lookupNPI} disabled={npiLoading}>
              {npiLoading ? <><span className="spinner"></span> Searching…</> : '🔍 Look Up'}
            </button>
          </div>
          {npiResult && (
            <div className="npi-result-box show" style={{
              background: npiResult.error ? '#fdf0f0' : 'var(--primary-ll)',
              border: `1px solid ${npiResult.error ? '#f0c8c8' : '#c8e6d4'}`,
              marginTop: 8
            }}>
              {npiResult.error
                ? <div style={{ color: 'var(--red)', fontSize: 12.5 }}>{npiResult.error}</div>
                : <>
                  <div className="nr-name">{[npiResult.fname, npiResult.lname].filter(Boolean).join(' ')}{npiResult.cred ? ` · ${npiResult.cred}` : ''}</div>
                  <div className="nr-detail">{npiResult.spec}{npiResult.addr ? ` · ${npiResult.addr}` : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--green-d)', marginTop: 4, fontWeight: 500 }}>✓ Form pre-filled from NPPES</div>
                </>
              }
            </div>
          )}
        </>
      )}

      {/* ── Mode B: By Name ── */}
      {mode === 'name' && (
        <>
          <form onSubmit={searchByName}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <input type="text" value={fname} onChange={e => setFname(e.target.value)} placeholder="First name" style={{ flex: '1 1 120px', minWidth: 100 }} />
              <input type="text" value={lname} onChange={e => setLname(e.target.value)} placeholder="Last name" style={{ flex: '1 1 140px', minWidth: 100 }} />
              <select value={state} onChange={e => setState(e.target.value)} style={{ flex: '0 0 80px' }}>
                <option value="">All</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="submit" className="btn btn-green" disabled={nameLoading}>
                {nameLoading ? <><span className="spinner"></span> Searching…</> : '🔍 Search'}
              </button>
            </div>
          </form>
          {nameError && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{nameError}</div>}
          {nameResults !== null && nameResults.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-4)', padding: '8px 0' }}>No results. Try last name only or remove the state filter.</div>
          )}
          {nameResults && nameResults.map((r, i) => {
            const isSelected = selected === r.npi
            return (
              <div key={r.npi || i} onClick={() => applyResult(r)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                background: isSelected ? 'var(--primary-ll)' : 'var(--surface)',
                border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                transition: 'all .12s',
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: 'var(--primary-l)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                  {(r.fname[0]||'?')}{(r.lname[0]||'')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{r.fname} {r.lname}{r.credential ? `, ${r.credential}` : ''}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[r.taxonomyDesc, r.city && r.state ? `${r.city}, ${r.state}` : r.state].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <span className="info-chip" style={{ fontSize: 10 }}>NPI {r.npi}</span>
                  {r.npiStatus === 'Active' && <span className="badge b-green" style={{ fontSize: 10 }}>Active</span>}
                  {isSelected
                    ? <span style={{ fontSize: 12, color: 'var(--green-d)', fontWeight: 600 }}>✓ Applied</span>
                    : <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 500 }}>Select →</span>
                  }
                </div>
              </div>
            )
          })}
          {selected && (
            <div style={{ fontSize: 11.5, color: 'var(--green-d)', fontWeight: 600, marginTop: 6, padding: '6px 10px', background: 'var(--primary-ll)', borderRadius: 6 }}>
              ✓ Provider selected — form fields pre-filled from NPPES. Review and save below.
            </div>
          )}
        </>
      )}

      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>
        Searches the official CMS NPPES database · 8M+ providers · No login required
      </div>
    </div>
  )
}
