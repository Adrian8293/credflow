/**
 * HelpPage.jsx — in-app guide: getting started, where things are, stage meanings, roles, alerts, FAQ.
 * Static content (no data, no network). Everything described here exists in the app.
 */
import { useMemo, useState } from 'react'
import { STAGES } from '../../constants/stages.js'

const STAGE_HELP = {
  'Not Started': 'On your list, but nothing has been sent to the payer yet.',
  'Application Submitted': 'The application went to the payer. Set a follow-up date.',
  'Awaiting CAQH': 'The payer is waiting on CAQH access or a fresh attestation. Check that the provider’s CAQH is attested and shared with the payer.',
  'Pending Verification': 'The payer is verifying primary sources (license, malpractice, education, work history).',
  'Additional Info Requested': 'The payer asked for something. Answer before their deadline; use Requests to ask the provider.',
  'Under Review': 'Verification is done and the payer’s credentialing committee is reviewing.',
  'Approved – Awaiting Contract': 'Credentialing was approved. A contract or participation agreement is still pending.',
  'Contracted – Pending Effective Date': 'Contract is signed. Do not bill until the effective date.',
  'Active': 'Effective. The provider can bill this payer from the Billable From date.',
  'Denied': 'The payer denied the application. Record why in the notes and decide on appeal or reapply.',
}

const SECTIONS = [
  { id: 'start', title: 'Getting started (first week)', body: [
    ['1', 'Add your payers on the Payers page. Add your legal entity (name, Type 2 NPI, EIN last 4, locations) on Groups.'],
    ['2', 'Add providers: Providers → Add Provider (start from an NPI and the rest fills in) or Import CSV for many at once.'],
    ['3', 'On each provider, enter license, malpractice, DEA (if any) and CAQH dates. These dates drive every alert.'],
    ['4', 'Start an application per provider and payer (Applications → New Application, or Import CSV). Set a follow-up date.'],
    ['5', 'Invite teammates and providers on the Access page, and turn on two-step verification in Settings → Security.'],
    ['6', 'Open Reports → Data Quality and clear the high-priority items.'],
  ]},
  { id: 'daily', title: 'Your daily routine', body: [
    ['Today', 'Start here. One inbox of everything due: expiring credentials, follow-ups, overdue tasks, documents waiting for review.'],
    ['Alerts', 'Every expiring or expired credential with a next step. When a provider renews, click Record renewal and enter the new expiration date.'],
    ['Requests', 'Ask a provider for a document. They upload it in their portal and it lands here for your review.'],
    ['Tasks', 'To-dos with due dates. Overdue ones show up on Today and Alerts.'],
  ]},
  { id: 'pages', title: 'What each page is for', body: [
    ['Applications', 'Every payer application and its stage. Filter, select several rows for bulk stage / follow-up changes, import or export CSV.'],
    ['Providers', 'Your roster. Open one for licenses (including other states), IDs, documents and enrollments. The Packet button prints a credentialing packet.'],
    ['Payers', 'The payers you work with and what each requires.'],
    ['Groups', 'Your legal entities, payer contracts and the providers enrolled under them.'],
    ['Billing Matrix', 'Who can bill which payer today. Click a cell to open the enrollment, or an empty cell to start one.'],
    ['Documents', 'Credential documents with their expiration dates.'],
    ['Reports', 'Real numbers from your data: applications, turnaround, compliance, exports, and Data Quality.'],
    ['Audit Trail', 'A log of who changed what and when.'],
    ['Access', 'Who can sign in, with which role, and invite links (owners and admins).'],
    ['Settings', 'Practice details, alert timing, notifications, two-step verification and session timeout.'],
  ]},
  { id: 'roles', title: 'Roles', body: [
    ['Owner', 'Full control, including other owners.'],
    ['Admin', 'Everything except changing owners. Can invite people.'],
    ['Credentialer', 'Does the credentialing work. Cannot manage access.'],
    ['Viewer', 'Read-only access to everything in the organization.'],
    ['Clinic staff', 'Portal only: sees every provider’s status and expirations, and uploads documents for them.'],
    ['Provider', 'Portal only: sees their own applications and expirations, and uploads their own documents.'],
  ]},
  { id: 'alerts', title: 'How alerts work', body: [
    ['Timing', 'Credentials alert starting 90 days before they expire (CAQH: 30 days). You can change both in Settings.'],
    ['Colors', 'Expired or ≤ 30 days is critical, 31–60 days is a warning, beyond that is a notice.'],
    ['Needs dates', 'A credential with no expiration date cannot alert. Reports → Data Quality lists those.'],
    ['Inactive', 'Inactive providers and Denied applications do not create alerts.'],
    ['License gaps', 'An enrollment in a state where the provider has no current license is flagged.'],
  ]},
  { id: 'faq', title: 'Common questions', body: [
    ['A provider renewed their license. What now?', 'Alerts → Record renewal, and enter the new expiration date. Or edit the provider directly. For an extra-state license, update it in the provider’s Licenses section.'],
    ['Can I print something for a payer or auditor?', 'Open the provider and click Packet, then Print / Save as PDF.'],
    ['How do I load many providers or applications?', 'Providers and Applications each have an Import CSV button with a template and a preview before anything is saved.'],
    ['Why was a row skipped in an import?', 'The preview shows the reason on each row, such as an invalid NPI, an unknown payer, or a duplicate.'],
    ['I was signed out.', 'Sessions end after 30 minutes without activity (adjustable in Settings → Security).'],
    ['Does Lacentra hold patient information?', 'No. It is for credentialing only: provider credentials, payer enrollments and the documents that support them. Do not upload patient information.'],
  ]},
]

const Row = ({ k, v }) => (
  <div style={{ display: 'flex', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--border-l)' }}>
    <div style={{ width: 190, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{k}</div>
    <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{v}</div>
  </div>
)

export function HelpPage() {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const match = (...s) => !needle || s.join(' ').toLowerCase().includes(needle)

  const sections = useMemo(() => SECTIONS
    .map(sec => ({ ...sec, body: sec.body.filter(([k, v]) => match(sec.title, k, v)) }))
    .filter(sec => sec.body.length > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [needle])
  const stages = STAGES.filter(s => match('stage', s, STAGE_HELP[s] || ''))

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Help</h2>
        <p style={{ fontSize: 13, color: 'var(--text-4)' }}>A short guide to working in Lacentra.</p>
      </div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search this guide…" aria-label="Search the help guide"
        style={{ width: '100%', maxWidth: 420, marginBottom: 18 }} />

      {sections.map(sec => (
        <div key={sec.id} className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3 style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>{sec.title}</h3></div>
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {sec.body.map(([k, v]) => <Row key={k} k={k} v={v} />)}
          </div>
        </div>
      ))}

      {stages.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3 style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>What each application stage means</h3></div>
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {stages.map(s => <Row key={s} k={s} v={STAGE_HELP[s] || ''} />)}
          </div>
        </div>
      )}

      {sections.length === 0 && stages.length === 0 && (
        <div className="empty-state"><div className="empty-state-title">Nothing matches “{q}”</div><div className="empty-state-desc">Try a shorter word, like “license”, “import” or “stage”.</div></div>
      )}
    </div>
  )
}

export default HelpPage
