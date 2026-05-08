import { daysUntil, fmtDate } from '../../lib/helpers.js'

const NEXT_STEPS = {
  'License':                'Contact provider for renewal documentation; verify with state board.',
  'Malpractice Insurance':  'Request updated COI from provider; upload to Documents.',
  'DEA Certificate':        'Notify provider to renew via DEA.gov; collect new certificate.',
  'CAQH Attestation':       'Send CAQH re-attestation reminder; verify all sections current.',
  'Recredentialing':        'Initiate recredentialing packet; check payer-specific requirements.',
  'Supervision Agreement':  'Request updated supervision agreement signed by both parties.',
}

const LABEL_TO_FIELD = {
  'License':                'licenseExp',
  'Malpractice Insurance':  'malExp',
  'DEA Certificate':        'deaExp',
  'CAQH Attestation':       'caqhDue',
  'Recredentialing':        'recred',
  'Supervision Agreement':  'supExp',
}

export function Alerts({ db, onOpenProvider, onDraftEmail, onMarkDone }) {
  const alertDays = db.settings.alertDays || 90
  const caqhDays = db.settings.caqhDays || 30
  const items = []
  db.providers.forEach(p => {
    [
      { f: 'licenseExp', l: 'License',                th: alertDays },
      { f: 'malExp',     l: 'Malpractice Insurance',  th: alertDays },
      { f: 'deaExp',     l: 'DEA Certificate',        th: alertDays },
      { f: 'caqhDue',    l: 'CAQH Attestation',       th: caqhDays  },
      { f: 'recred',     l: 'Recredentialing',        th: alertDays },
      { f: 'supExp',     l: 'Supervision Agreement',  th: alertDays },
    ].forEach(c => {
      if (!p[c.f]) return
      const d = daysUntil(p[c.f])
      if (d !== null && d <= c.th) items.push({ p, label: c.label, days: d, date: p[c.f] })
    })
  })
  items.sort((a, b) => a.days - b.days)
  const urgent   = items.filter(a => a.days <= 0)
  const critical = items.filter(a => a.days > 0 && a.days <= 30)
  const warning  = items.filter(a => a.days > 30 && a.days <= 60)
  const notice   = items.filter(a => a.days > 60)

  function Row({ a, cls }) {
    return (
      <div className={`alert-item ${cls}`}>
        <div className="al-icon">{a.days < 0 ? '❌' : '⚠️'}</div>
        <div className="al-body">
          <div className="al-title">
            {a.p.fname} {a.p.lname}{a.p.cred ? ', ' + a.p.cred : ''} — {a.label}
          </div>
          <div className="al-sub">
            {fmtDate(a.date)} · {a.days < 0 ? `Expired ${Math.abs(a.days)} days ago` : `${a.days} days remaining`}
          </div>
          <div className="al-nextstep">
            <b>Next step:</b> {NEXT_STEPS[a.label] || 'Review with provider and update record.'}
          </div>
          <div className="al-actions">
            <button className="btn btn-sm" onClick={() => onOpenProvider?.(a.p.id)}>
              Open Provider
            </button>
            <button className="btn btn-sm" onClick={() => onDraftEmail?.({ provId: a.p.id, payId: null, alertLabel: a.label, alertDays: a.days, alertDate: a.date })}>
              Draft Email
            </button>
            <button className="btn btn-sm" onClick={() => onMarkDone?.(a.p.id, LABEL_TO_FIELD[a.label])}>
              Mark Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  function Section({ title, list, cls }) {
    if (!list.length) return null
    return (
      <div className="mb-20">
        <div className="text-xs font-500" style={{ letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>
          {title} ({list.length})
        </div>
        {list.map((a, i) => <Row key={i} a={a} cls={cls} />)}
      </div>
    )
  }

  return (
    <div className="page">
      {items.length ? (
        <>
          <Section title="🔴 Expired / Overdue"        list={urgent}   cls="al-red" />
          <Section title="🟠 Critical — ≤30 Days"      list={critical} cls="al-red" />
          <Section title="🟡 Warning — 31–60 Days"     list={warning}  cls="al-amber" />
          <Section title="📅 Notice — 61–90 Days"      list={notice}   cls="al-blue" />
        </>
      ) : (
        <div className="empty-state">
          <div className="ei">✅</div>
          <h4>No Active Alerts</h4>
          <p>All credentials are within acceptable thresholds.</p>
        </div>
      )}
    </div>
  )
}

export default Alerts
