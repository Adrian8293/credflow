/**
 * PayerHub.jsx — PrimeCredential
 * Simplified: single "Enrollments" tab as default view.
 * Secondary access to Payer Directory, Kanban Pipeline, and Library via view-switcher buttons.
 * No sub-tabs — just one clean enrollment table with inner navigation.
 */

import { useState } from 'react'
import { fmtDate, fmtFull, pNameShort, payName } from '../../lib/helpers.js'
import { StageBadge } from '../../components/ui/Badge.jsx'
import { useSorted } from '../../hooks/useSorted.js'
import { STAGES } from '../../constants/stages.js'
import { PayersTab } from './PayersTab.jsx'
import { KanbanPipeline } from '../enrollments/KanbanPipeline.jsx'
import { PayerRequirements } from './PayerRequirements.jsx'

const SearchIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

const VIEWS = [
  { id: 'enrollments', label: 'Enrollments',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
  { id: 'directory', label: 'Payer Directory',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
  { id: 'pipeline', label: 'Pipeline',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="13" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg> },
  { id: 'library', label: 'Payer Library',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
]

function EnrollmentTable({ db, search, setSearch, fStage, setFStage, fProv, setFProv, openEnrollModal, handleDeleteEnrollment, onDraftEmail }) {
  const [menuOpen, setMenuOpen] = useState(null)

  const filtered = db.enrollments.filter(e => {
    const txt = `${pNameShort(db.providers, e.provId)} ${payName(db.payers, e.payId)} ${e.stage||''} ${e.notes||''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase()))
      && (!fStage || e.stage === fStage)
      && (!fProv  || e.provId === fProv)
  })

  const { sorted: list, thProps } = useSorted(filtered, 'submitted')

  return (
    <>
      {/* Toolbar — search LEFT, filters RIGHT */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="search-box" style={{ flex: '1 1 200px', maxWidth: 280 }}>
          <span className="si">{SearchIcon}</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search enrollments…" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <select className="filter-select" value={fProv} onChange={e => setFProv(e.target.value)}>
            <option value="">All Providers</option>
            {db.providers.map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
          </select>
          <select className="filter-select" value={fStage} onChange={e => setFStage(e.target.value)}>
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
          {(search || fStage || fProv) && (
            <button onClick={() => { setSearch(''); setFStage(''); setFProv('') }}
              style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear ×</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal()}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Application
          </button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th {...thProps('provId', 'Provider')} />
              <th {...thProps('payId', 'Payer')} />
              <th style={{ width: 80 }}>Payer Type</th>
              <th {...thProps('stage', 'Status / Stage')} />
              <th {...thProps('submitted', 'Submitted')} />
              <th {...thProps('effective', 'Effective Date')} />
              <th {...thProps('followup', 'Follow-up')} />
              <th style={{ width: 60, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!list.length ? (
              <tr><td colSpan={8}>
                <div className="empty-state">
                  <div className="empty-state-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E56F0" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
                  <div className="empty-state-title">No enrollments found</div>
                  <div className="empty-state-desc">Create an enrollment to start tracking payer credentialing.</div>
                  <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal()}>+ New Application</button>
                </div>
              </td></tr>
            ) : list.map(e => {
              const fuD   = fmtDate(e.followup) !== '—' ? (new Date(e.followup) - new Date()) / 86400000 : null
              const fuCol = fuD !== null && fuD <= 0 ? 'var(--danger)' : fuD !== null && fuD <= 7 ? 'var(--warning)' : 'var(--text-3)'
              const payer = db.payers.find(x => x.id === e.payId)
              const isOpen = menuOpen === e.id
              return (
                <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => openEnrollModal(e.id)}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{pNameShort(db.providers, e.provId)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{db.providers.find(x=>x.id===e.provId)?.cred||''}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{payName(db.payers, e.payId)}</td>
                  <td>
                    {payer?.type
                      ? <span className={`badge ${payer.type==='Commercial'?'b-blue':payer.type==='Medicaid'?'b-purple':payer.type==='Medicare'?'b-teal':'b-gray'}`}>{payer.type}</span>
                      : '—'}
                  </td>
                  <td><StageBadge stage={e.stage} /></td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(e.submitted)}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(e.effective)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {e.followup
                      ? <span style={{ fontSize: 12, fontWeight: fuD !== null && fuD <= 7 ? 700 : 400, color: fuCol }}>{fmtDate(e.followup)}</span>
                      : '—'}
                  </td>
                  <td onClick={ev => ev.stopPropagation()} style={{ position: 'relative', textAlign: 'center' }}>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}
                      onClick={() => setMenuOpen(isOpen ? null : e.id)}>···</button>
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, zIndex: 50,
                        background: 'var(--card)', border: '1.5px solid var(--border)',
                        borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)',
                        minWidth: 170, overflow: 'hidden',
                      }}>
                        <button className="dropdown-item" onClick={() => { openEnrollModal(e.id); setMenuOpen(null) }}>✏ Edit Enrollment</button>
                        {onDraftEmail && <button className="dropdown-item" onClick={() => { onDraftEmail(e); setMenuOpen(null) }}>✉ Draft Follow-up</button>}
                        <div style={{ height:1, background:'var(--border-l)', margin:'3px 0' }} />
                        <button className="dropdown-item" style={{ color:'var(--danger)' }} onClick={() => { handleDeleteEnrollment(e.id); setMenuOpen(null) }}>✕ Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {list.length > 0 && (
          <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 16px', background:'var(--elevated)', borderTop:'1px solid var(--border-l)' }}>
            <span style={{ fontSize:11.5, color:'var(--text-4)' }}>Showing {list.length} of {db.enrollments.length} enrollments</span>
          </div>
        )}
      </div>
    </>
  )
}

export function PayerHub({ db, initialTab, openEnrollModal, openPayerModal, search, setSearch, fStage, setFStage, fProv, setFProv, handleDeleteEnrollment, paySearch, setPaySearch, payFType, setPayFType, handleDeletePayer, onDraftEmail }) {
  const [view, setView] = useState('enrollments')

  return (
    <div className="page">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'var(--text-1)', letterSpacing:'-.04em', margin:0, marginBottom:4 }}>Payers</h2>
          <p style={{ fontSize:12.5, color:'var(--text-4)', margin:0 }}>Manage payer enrollments and relationships. {fmtFull()}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => openPayerModal()}>+ Add Payer</button>
          <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal()}>+ New Application</button>
        </div>
      </div>

      {/* View switcher — horizontal pill buttons */}
      <div style={{ display:'flex', gap:6, marginBottom:18, background:'var(--elevated)', border:'1.5px solid var(--border)', borderRadius:'var(--r-lg)', padding:4, width:'fit-content' }}>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            display:'flex', alignItems:'center', gap:6, padding:'6px 14px',
            borderRadius:'var(--r)', fontSize:12.5, fontWeight:500, border:'none',
            cursor:'pointer', fontFamily:'inherit', transition:'all var(--t)',
            background: view===v.id ? 'var(--card)' : 'transparent',
            color: view===v.id ? 'var(--pr)' : 'var(--text-3)',
            fontWeight: view===v.id ? 700 : 500,
            boxShadow: view===v.id ? 'var(--shadow-sm)' : 'none',
          }}>
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {view === 'enrollments' && (
        <EnrollmentTable
          db={db} search={search} setSearch={setSearch}
          fStage={fStage} setFStage={setFStage} fProv={fProv} setFProv={setFProv}
          openEnrollModal={openEnrollModal} handleDeleteEnrollment={handleDeleteEnrollment}
          onDraftEmail={onDraftEmail}
        />
      )}
      {view === 'directory' && (
        <PayersTab db={db} search={paySearch} setSearch={setPaySearch} fType={payFType} setFType={setPayFType} openPayerModal={openPayerModal} handleDeletePayer={handleDeletePayer} />
      )}
      {view === 'pipeline' && (
        <KanbanPipeline db={db} openEnrollModal={openEnrollModal} />
      )}
      {view === 'library' && (
        <PayerRequirements db={db} />
      )}
    </div>
  )
}

export default PayerHub
