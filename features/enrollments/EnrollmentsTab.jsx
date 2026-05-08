import { STAGES } from '../../constants/stages.js'
import { useSorted } from '../../hooks/useSorted.js'
import { Badge, StageBadge } from '../../components/ui/Badge.jsx'
import { daysUntil, fmtDate, pName, pNameShort, payName } from '../../lib/helpers.js'

export function EnrollmentsTab({ db, search, setSearch, fStage, setFStage, fProv, setFProv, openEnrollModal, handleDeleteEnrollment }) {
  const filtered = db.enrollments.filter(e => {
    const txt = `${pName(db.providers,e.provId)} ${payName(db.payers,e.payId)} ${e.stage} ${e.notes}`.toLowerCase()
    return (!(search)||txt.includes(search.toLowerCase())) && (!fStage||e.stage===fStage) && (!fProv||e.provId===fProv)
  })
  const {sorted:list, thProps} = useSorted(filtered, 'stage')
  return <>
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search enrollments…" /></div>
      <select className="filter-select" value={fStage} onChange={e=>setFStage(e.target.value)}>
        <option value="">All Stages</option>
        {STAGES.map(s=><option key={s}>{s}</option>)}
      </select>
      <select className="filter-select" value={fProv} onChange={e=>setFProv(e.target.value)}>
        <option value="">All Providers</option>
        {db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
      </select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>openEnrollModal()}>＋ New Enrollment</button></div>
    </div>
    <div className="tbl-wrap">
      <table><thead><tr>
          <th {...thProps('provId','Provider')} />
          <th {...thProps('payId','Payer')} />
          <th {...thProps('stage','Stage')} />
          <th {...thProps('submitted','Submitted')} />
          <th {...thProps('effective','Effective')} />
          <th className="no-sort">EFT / ERA</th>
          <th {...thProps('followup','Follow-up')} />
          <th className="no-sort">Actions</th>
        </tr></thead>
        <tbody>
          {!list.length ? <tr><td colSpan={8}><div className="empty-state"><div className="ei">🏥</div><h4>No enrollments found</h4></div></td></tr> : list.map(e => {
            const fuD = daysUntil(e.followup)
            const fuCls = fuD!==null&&fuD<=0?'b-red':fuD!==null&&fuD<=7?'b-amber':'b-blue'
            return <tr key={e.id}>
              <td><strong>{pNameShort(db.providers,e.provId)}</strong><div className="text-xs text-muted">{db.providers.find(x=>x.id===e.provId)?.cred||''}</div></td>
              <td>{payName(db.payers,e.payId)}</td>
              <td><StageBadge stage={e.stage} /></td>
              <td style={{ whiteSpace:'nowrap' }}>{fmtDate(e.submitted)}</td>
              <td style={{ whiteSpace:'nowrap' }}>{fmtDate(e.effective)}</td>
              <td><div style={{ display:'flex', gap:4 }}><Badge cls={e.eft==='Active'?'b-green':'b-gray'}>EFT: {e.eft}</Badge><Badge cls={e.era==='Active'?'b-green':'b-gray'}>ERA: {e.era}</Badge></div></td>
              <td style={{ whiteSpace:'nowrap' }}>{e.followup?<Badge cls={fuCls}>{fmtDate(e.followup)}</Badge>:'—'}</td>
              <td><div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-secondary btn-sm" onClick={()=>openEnrollModal(e.id)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeleteEnrollment(e.id)}>Del</button>
              </div></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </>
}

// ─── PAYERS ────────────────────────────────────────────────────────────────────

export { EnrollmentsTab }
