import { useSorted } from '../../hooks/useSorted.js'
import { Badge } from '../../components/ui/Badge.jsx'

export function PayersTab({ db, search, setSearch, fType, setFType, openPayerModal, handleDeletePayer }) {
  const rawPayers = db.payers.filter(p => `${p.name} ${p.payerId} ${p.type}`.toLowerCase().includes((search||'').toLowerCase()) && (!fType||p.type===fType))
  const {sorted:list, thProps} = useSorted(rawPayers, 'name')
  return <>
    <div className="toolbar">
      <div className="search-box"><span className="si"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search payers…" /></div>
      <select className="filter-select" value={fType} onChange={e=>setFType(e.target.value)}><option value="">All Types</option><option>Commercial</option><option>Medicaid</option><option>Medicare</option><option>Medicare Advantage</option><option>EAP</option><option>Other</option></select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>openPayerModal()}>＋ Add Payer</button></div>
    </div>
    <div className="tbl-wrap">
      <table><thead><tr>
          <th {...thProps('name','Payer Name')} />
          <th {...thProps('payerId','Payer ID')} />
          <th {...thProps('type','Type')} />
          <th className="no-sort">Phone</th>
          <th className="no-sort">Portal</th>
          <th {...thProps('timeline','Timeline')} />
          <th className="no-sort">Notes</th>
          <th className="no-sort">Actions</th>
        </tr></thead>
        <tbody>
          {!list.length ? <tr><td colSpan={8}><div className="empty-state"><div className="ei">🗂</div><h4>No payers found</h4></div></td></tr> : list.map(p => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong></td>
              <td><code style={{ background:'var(--surface-2)', padding:'2px 6px', borderRadius:4, fontSize:'11.5px' }}>{p.payerId||'—'}</code></td>
              <td><Badge cls="b-blue">{p.type}</Badge></td>
              <td>{p.phone||'—'}</td>
              <td>{p.portal?<a href={p.portal} target="_blank" rel="noreferrer" style={{ color:'var(--primary)', fontSize:'12px' }}>Portal ↗</a>:'—'}</td>
              <td><Badge cls="b-gray">{p.timeline||'—'}</Badge></td>
              <td style={{ maxWidth:180, fontSize:12, color:'var(--ink-4)' }}>{p.notes?p.notes.slice(0,70)+(p.notes.length>70?'…':''):'—'}</td>
              <td><div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-secondary btn-sm" onClick={()=>openPayerModal(p.id)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeletePayer(p.id)}>Del</button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
}
