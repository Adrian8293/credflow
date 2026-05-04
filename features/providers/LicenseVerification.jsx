import { useState } from 'react'

export function LicenseVerification() {
  const VERIF_SOURCES = [
    { icon: '🎓', title: 'OBLPCT — LPCs & MFTs', desc: 'Verify LPC, LPCA, LMFT, LMFTA licenses.', bg: '#f0fdf4', color: '#16a34a', cta: 'Verify LPC / LMFT →', href: 'https://oblpct.us.thentiacloud.net/webs/oblpct/register/#', note: 'Oregon official registry' },
    { icon: '🧩', title: 'BLSW — LCSWs', desc: 'Verify LCSW, CSWA, LSW licenses.', bg: '#f0fdf4', color: '#0891b2', cta: 'Verify LCSW →', href: 'https://blsw.us.thentiacloud.net/webs/blsw/register/#/', note: 'Oregon official registry' },
    { icon: '🧠', title: 'Oregon Board of Psychology', desc: 'Verify Licensed Psychologist (PhD/PsyD) licenses.', bg: '#faf5ff', color: '#7c3aed', cta: 'Verify License →', href: 'https://obp.us.thentiacloud.net/webs/obp/register/#', note: 'Oregon official registry' },
    { icon: '🌿', title: 'Oregon Board of Naturopathic Medicine', desc: 'Verify ND licenses.', bg: '#f0fdf4', color: '#0891b2', cta: 'Verify License →', href: 'https://obnm.us.thentiacloud.net/webs/obnm/register/#', note: 'Oregon official registry' },
    { icon: '🦴', title: 'Oregon Board of Chiropractic Examiners', desc: 'Verify DC licenses.', bg: '#fffbeb', color: '#d97706', cta: 'Verify License →', href: 'https://obce.us.thentiacloud.net/webs/obce/register/#', note: 'Oregon official registry' },
    { icon: '⚕️', title: 'Oregon Health Licensing Office (HLO)', desc: 'LMT, LAc, and 17 other health professions.', bg: '#fef2f2', color: '#dc2626', cta: 'Verify License →', href: 'https://hlo.us.thentiacloud.net/webs/hlo/register/#', note: 'Oregon official registry' },
    { icon: '📋', title: 'CAQH ProView', desc: 'Access provider credentialing profiles and attestation status. Requires a Participating Organization account.', bg: '#ecfeff', color: '#0891b2', cta: 'Open CAQH ProView →', href: 'https://proview.caqh.org', note: 'Call CAQH at 888-599-1771 to request PO access.' },
    { icon: '🏥', title: 'OHA Medicaid Provider Enrollment Check', desc: 'Verify OHP/Medicaid enrollment by NPI.', bg: '#f0fdf4', color: '#16a34a', cta: 'Check OHA Enrollment →', href: 'https://www.oregon.gov/oha/hsd/ohp/pages/provider-enroll.aspx', note: 'Enter provider NPI at the OHA tool.' },
    { icon: '🚨', title: 'OIG LEIE — Exclusions Database', desc: 'Check for federal healthcare program exclusions. Run before credentialing any new provider.', bg: '#fef2f2', color: '#dc2626', cta: 'Search OIG Exclusions →', href: 'https://exclusions.oig.hhs.gov/', note: 'Free and real-time.' },
    { icon: '💊', title: 'DEA Registration Verification', desc: 'Verify active DEA registration for prescribing providers.', bg: '#faf5ff', color: '#7c3aed', cta: 'Verify DEA →', href: 'https://apps.deadiversion.usdoj.gov/webforms2/spring/validationLogin', note: 'Requires a DEA account.' },
  ]

  return (
    <div className="page">
      <div className="card-header" style={{ marginBottom: 20 }}>
        <h3>✅ License Verification Sources</h3>
        <span className="ch-meta">Official state boards & federal databases</span>
      </div>
      <div style={{ background:'var(--blue-l)', border:'1px solid var(--blue-b)', borderRadius:'var(--r-lg)', padding:'14px 18px', marginBottom:20, fontSize:13, color:'var(--blue)' }}>
        <strong>How to use this page:</strong> Click any source below to open the official verification portal in a new tab.
        For each provider you credential, check NPPES, their state board, and the OIG exclusions database at minimum.
      </div>
      {VERIF_SOURCES.map((s, i) => (
        <div key={i} className="verif-card">
          <div className="verif-icon" style={{ background:s.bg, color:s.color }}>{s.icon}</div>
          <div className="verif-body">
            <div className="verif-title">{s.title}</div>
            <div className="verif-desc">{s.desc}</div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <a href={s.href} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">{s.cta}</a>
            </div>
            {s.note && <div className="verif-note">{s.note}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}


// ─── PSYCHOLOGY TODAY PAGE ─────────────────────────────────────────────────────

export { LicenseVerification }
