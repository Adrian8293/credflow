import { daysUntil, pName, payName } from '../../lib/helpers.js'
import { useState } from 'react'

export function RevenueAnalytics({ db }) {
  const { providers, payers, claims = [], payments = [] } = db
  const [period, setPeriod] = useState('month') // month | quarter | year | all

  function getWindowStart() {
    const now = new Date()
    if (period==='month') { const d=new Date(now); d.setDate(1); return d }
    if (period==='quarter') { const d=new Date(now); d.setMonth(Math.floor(d.getMonth()/3)*3,1); return d }
    if (period==='year') { return new Date(now.getFullYear(),0,1) }
    return new Date('2000-01-01')
  }

  const windowStart = getWindowStart()
  const inPeriod = c => !c.dos || new Date(c.dos) >= windowStart

  const periodClaims = claims.filter(inPeriod)
  const totalBilled = periodClaims.reduce((s,c)=>s+Number(c.billed_amount||0),0)
  const totalPaid = periodClaims.reduce((s,c)=>s+Number(c.paid_amount||0),0)
  const totalDenied = periodClaims.filter(c=>c.status==='Denied').reduce((s,c)=>s+Number(c.billed_amount||0),0)
  const totalAR = periodClaims.filter(c=>!['Paid','Written Off'].includes(c.status)).reduce((s,c)=>s+Number(c.billed_amount||0)-Number(c.paid_amount||0),0)
  const collRate = totalBilled > 0 ? (totalPaid/totalBilled*100) : 0

  // By Provider
  const byProvider = {}
  periodClaims.forEach(c => {
    const key = c.prov_id || 'unknown'
    if (!byProvider[key]) byProvider[key] = { billed:0, paid:0, count:0, denied:0 }
    byProvider[key].billed += Number(c.billed_amount||0)
    byProvider[key].paid += Number(c.paid_amount||0)
    byProvider[key].count++
    if (c.status==='Denied') byProvider[key].denied++
  })

  // By Payer
  const byPayer = {}
  periodClaims.forEach(c => {
    const key = c.payer_id || 'unknown'
    if (!byPayer[key]) byPayer[key] = { billed:0, paid:0, count:0 }
    byPayer[key].billed += Number(c.billed_amount||0)
    byPayer[key].paid += Number(c.paid_amount||0)
    byPayer[key].count++
  })

  // Monthly trend (last 6 months)
  const months = []
  for (let i=5;i>=0;i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth()-i)
    const label = d.toLocaleDateString('en-US',{month:'short',year:'2-digit'})
    const start = new Date(d)
    const end = new Date(d.getFullYear(), d.getMonth()+1, 1)
    const mc = claims.filter(c => c.dos && new Date(c.dos)>=start && new Date(c.dos)<end)
    months.push({
      label,
      billed: mc.reduce((s,c)=>s+Number(c.billed_amount||0),0),
      paid: mc.reduce((s,c)=>s+Number(c.paid_amount||0),0),
    })
  }
  const maxMonthVal = Math.max(...months.map(m=>m.billed), 1)

  const PROV_COLORS = ['#1a6ef5','#16a34a','#d97706','#7c3aed','#0891b2','#dc2626']

  return (
    <div className="page">
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <div style={{flex:1,fontFamily:'Poppins,sans-serif',fontSize:18,color:'var(--ink)'}}>Revenue Overview</div>
        <div style={{display:'flex',gap:4,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:4}}>
          {[['month','This Month'],['quarter','This Quarter'],['year','This Year'],['all','All Time']].map(([v,l])=>(
            <button key={v} className={`btn btn-sm ${period===v?'btn-primary':'btn-ghost'}`} style={{fontSize:11}} onClick={()=>setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Billed</div><div className="kpi-value" style={{fontSize:24}}>{fmtMoney(totalBilled)}</div><div className="kpi-sub">{periodClaims.length} claims</div></div>
        <div className="kpi kpi-teal"><div className="kpi-label">Collected</div><div className="kpi-value" style={{fontSize:24}}>{fmtMoney(totalPaid)}</div><div className="kpi-sub">{collRate.toFixed(1)}% collection rate</div></div>
        <div className="kpi kpi-amber"><div className="kpi-label">Outstanding A/R</div><div className="kpi-value" style={{fontSize:24}}>{fmtMoney(totalAR)}</div></div>
        <div className="kpi kpi-red"><div className="kpi-label">Denied</div><div className="kpi-value" style={{fontSize:24}}>{fmtMoney(totalDenied)}</div></div>
      </div>

      {/* Collection Rate Bar */}
      <div className="card mb-20">
        <div className="card-header"><h3>Collection Rate</h3><span className="ch-meta">{collRate.toFixed(1)}% of billed collected</span></div>
        <div className="card-body">
          <div style={{height:12,background:'var(--border-2)',borderRadius:6,overflow:'hidden',marginBottom:8}}>
            <div style={{height:'100%',width:`${Math.min(collRate,100)}%`,background: collRate>=85?'var(--green)':collRate>=70?'var(--amber)':'var(--red)',borderRadius:6,transition:'width .4s'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--ink-4)'}}>
            <span>0%</span><span style={{color:collRate>=85?'var(--green)':collRate>=70?'var(--amber)':'var(--red)',fontWeight:600}}>{collRate.toFixed(1)}%</span><span>100%</span>
          </div>
          <div style={{marginTop:10,fontSize:12,color:'var(--ink-3)'}}>
            Industry benchmark for mental health practices: <strong>75–85%</strong>. {collRate>=85?'✅ Above benchmark!':collRate>=75?'🟡 Within benchmark.':'⚠️ Below benchmark — review denial patterns.'}
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="card mb-20">
        <div className="card-header"><h3>Monthly Billing Trend</h3><span className="ch-meta">Last 6 months</span></div>
        <div className="card-body">
          {months.every(m=>m.billed===0) ? (
            <div className="empty-state" style={{padding:24}}><div className="ei">📊</div><p>No claim data yet — add claims to see trends</p></div>
          ) : (
            <div style={{display:'flex',alignItems:'flex-end',gap:8,height:140,paddingBottom:24,position:'relative'}}>
              {months.map((m,i) => (
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                  <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:110}}>
                    <div style={{flex:1,background:'#dbeafe',borderRadius:'4px 4px 0 0',height:`${(m.billed/maxMonthVal)*100}%`,minHeight:2,position:'relative'}} title={`Billed: ${fmtMoney(m.billed)}`}/>
                    <div style={{flex:1,background:'#16a34a',borderRadius:'4px 4px 0 0',height:`${(m.paid/maxMonthVal)*100}%`,minHeight:m.paid>0?2:0}} title={`Paid: ${fmtMoney(m.paid)}`}/>
                  </div>
                  <div style={{fontSize:9,color:'var(--ink-4)',whiteSpace:'nowrap'}}>{m.label}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{display:'flex',gap:16,marginTop:4}}>
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}><div style={{width:10,height:10,background:'#dbeafe',borderRadius:2}}/><span>Billed</span></div>
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}><div style={{width:10,height:10,background:'#16a34a',borderRadius:2}}/><span>Collected</span></div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* By Provider */}
        <div className="card">
          <div className="card-header"><h3>Revenue by Provider</h3></div>
          <div className="card-body">
            {Object.keys(byProvider).length === 0 ? (
              <div className="empty-state" style={{padding:16}}><p>No data yet</p></div>
            ) : Object.entries(byProvider).sort((a,b)=>b[1].billed-a[1].billed).map(([provId, data], i) => (
              <div key={provId} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontSize:12.5,fontWeight:600,color:'var(--ink)'}}>{pNameShort(providers,provId)||'Unknown'}</div>
                  <div style={{fontSize:12,color:'var(--ink-3)'}}>{fmtMoney(data.paid)} / {fmtMoney(data.billed)}</div>
                </div>
                <div style={{height:7,background:'var(--border-2)',borderRadius:4,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${data.billed>0?(data.paid/data.billed*100):0}%`,background:PROV_COLORS[i%PROV_COLORS.length],borderRadius:4}}/>
                </div>
                <div style={{fontSize:10,color:'var(--ink-4)',marginTop:2}}>{data.count} claims · {data.denied} denied</div>
              </div>
            ))}
          </div>
        </div>

        {/* By Payer */}
        <div className="card">
          <div className="card-header"><h3>Revenue by Payer</h3></div>
          <div className="card-body">
            {Object.keys(byPayer).length === 0 ? (
              <div className="empty-state" style={{padding:16}}><p>No data yet</p></div>
            ) : Object.entries(byPayer).sort((a,b)=>b[1].paid-a[1].paid).map(([payerId, data], i) => (
              <div key={payerId} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontSize:12.5,fontWeight:600}}>{payName(payers,payerId)||'Unknown'}</div>
                  <div style={{fontSize:12,color:'var(--ink-3)'}}>{data.billed>0?(data.paid/data.billed*100).toFixed(0):0}% collected</div>
                </div>
                <div style={{height:7,background:'var(--border-2)',borderRadius:4,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${data.billed>0?(data.paid/data.billed*100):0}%`,background:PROV_COLORS[(i+2)%PROV_COLORS.length],borderRadius:4}}/>
                </div>
                <div style={{fontSize:10,color:'var(--ink-4)',marginTop:2}}>{data.count} claims · {fmtMoney(data.paid)} paid</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-12" style={{marginTop:16}}>
        <div className="card-header"><h3>SimplePractice Import Guide</h3></div>
        <div className="card-body">
          <div style={{fontSize:13,color:'var(--ink-3)',lineHeight:1.7}}>
            Since SimplePractice doesn't offer a direct API integration, revenue data must be imported manually. Here's the recommended workflow:
          </div>
          <ol style={{marginTop:12,paddingLeft:20,fontSize:13,color:'var(--ink-3)',lineHeight:2}}>
            <li>In SimplePractice, go to <strong>Reports → Billing</strong></li>
            <li>Export to CSV for the desired date range</li>
            <li>Enter each claim in the <strong>Claims Tracker</strong> (or use the upcoming CSV import feature)</li>
            <li>Update payment status when EOBs / ERAs are received from payers</li>
            <li>Log any denials in the <strong>Denial Log</strong> with the reason code from the ERA</li>
          </ol>
          <div style={{marginTop:12,padding:'10px 14px',background:'var(--blue-l)',border:'1px solid var(--blue-b)',borderRadius:'var(--r-md)',fontSize:12,color:'var(--blue)'}}>
            💡 <strong>Future:</strong> CSV batch import for SimplePractice billing exports is planned. Until then, entering claims manually ensures accurate A/R aging and denial tracking.
          </div>
        </div>
      </div>
    </div>
  )
}

export { RevenueAnalytics }
