/**
 * Settings.jsx — PrimeCredential
 * Organization profile, alert thresholds, integrations, security, and data management.
 */

const Icon = {
  building: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  bell:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  database: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  users:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  lock:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  plug:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
}

import { useState } from 'react'

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: subtitle ? 2 : 0 }}>
        <span style={{ color: 'var(--pr)', display: 'flex' }}>{icon}</span>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
      </div>
      {subtitle && <p style={{ fontSize: 11.5, color: 'var(--text-4)', margin: '2px 0 0 22px' }}>{subtitle}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-l)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 38, height: 22, borderRadius: 11,
          background: checked ? 'var(--pr)' : 'var(--border-mid)',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background .15s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 19 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left .15s', display: 'block',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }} />
      </button>
    </div>
  )
}

const TABS = ['General', 'Organization', 'Users & Roles', 'Integrations', 'Notifications', 'Templates', 'Security']

export function Settings({ settingsForm, setSettingsForm, handleSaveSettings, exportJSON }) {
  const [activeTab, setActiveTab] = useState('General')
  const f   = k => settingsForm[k] ?? ''
  const set = (k, v) => setSettingsForm(prev => ({ ...prev, [k]: v }))
  // Notification toggles read/write directly from settingsForm so they persist on save
  const nb  = k => settingsForm[k] !== false  // default true unless explicitly set false

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Settings</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Manage system settings and configurations for PrimeCredential.</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {TABS.map(t => (
          <div key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>{t}</div>
        ))}
      </div>

      {activeTab === 'General' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <SectionHeader icon={Icon.building} title="Organization Information" subtitle="Your practice details used across PrimeCredential." />
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="fg full">
                  <label>Organization Name</label>
                  <input type="text" value={f('practice')} onChange={e => set('practice', e.target.value)} placeholder="PrimeCredential Health Partners" />
                </div>
                <div className="fg full">
                  <label>Tax ID (EIN)</label>
                  <input type="text" value={f('ein')} onChange={e => set('ein', e.target.value)} placeholder="12-3456789" />
                </div>
                <div className="fg full">
                  <label>Address</label>
                  <input type="text" value={f('address')} onChange={e => set('address', e.target.value)} placeholder="1234 Healthcare Way, Suite 300, Atlanta, GA 30009" />
                </div>
                <div className="fg">
                  <label>Phone</label>
                  <input type="tel" value={f('phone')} onChange={e => set('phone', e.target.value)} placeholder="(503) 123-4567" />
                </div>
                <div className="fg">
                  <label>Email</label>
                  <input type="email" value={f('email')} onChange={e => set('email', e.target.value)} placeholder="admin@primecredential.com" />
                </div>
              </div>
              <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Changes</button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <SectionHeader icon={Icon.bell} title="System Preferences" subtitle="Configure alert thresholds and automation behavior." />
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="fg">
                  <label>License / Malpractice alert (days)</label>
                  <input type="number" value={f('alertDays')} onChange={e => set('alertDays', parseInt(e.target.value) || 90)} min={30} max={365} />
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Recommended: 90 days</div>
                </div>
                <div className="fg">
                  <label>CAQH attestation alert (days)</label>
                  <input type="number" value={f('caqhDays')} onChange={e => set('caqhDays', parseInt(e.target.value) || 30)} min={7} max={90} />
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Recommended: 30 days</div>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <Toggle label="Document / credential expiration emails" checked={nb('emailExpiry')} onChange={v => set('emailExpiry', v)} />
                <Toggle label="Task due-date reminders" checked={nb('taskReminders')} onChange={v => set('taskReminders', v)} />
                <Toggle label="Document upload confirmations" checked={nb('docExpiry')} onChange={v => set('docExpiry', v)} />
                <Toggle label="Enable audit log" checked={nb('enableAuditLog')} onChange={v => set('enableAuditLog', v)} />
                <Toggle label="Two-factor authentication" checked={f('twoFactor') === true} onChange={v => set('twoFactor', v)} />
              </div>
              <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Organization' && (
        <Group2Settings settingsForm={settingsForm} setSettingsForm={setSettingsForm} handleSaveSettings={handleSaveSettings} />
      )}

      {activeTab === 'Users & Roles' && (
        <div className="card">
          <div className="card-header">
            <SectionHeader icon={Icon.users} title="Users & Roles" subtitle="Manage team members and their access permissions." />
            <div style={{ marginLeft: 'auto' }}>
              <button className="btn btn-primary btn-sm">+ Invite User</button>
            </div>
          </div>
          <div className="card-body">
            {[
              { name: 'Alex Kim', email: 'alex@primecredential.com', role: 'Admin', status: 'Active', last: '2 min ago' },
              { name: 'Jordan Smith', email: 'jordan@primecredential.com', role: 'Credentialing Specialist', status: 'Active', last: '1 hour ago' },
              { name: 'Taylor Brown', email: 'taylor@primecredential.com', role: 'Billing Manager', status: 'Active', last: 'Yesterday' },
              { name: 'Casey Johnson', email: 'casey@primecredential.com', role: 'Read Only', status: 'Inactive', last: '3 days ago' },
            ].map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-l)' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--pr)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {u.name.split(' ').map(n=>n[0]).join('')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'var(--elevated)', padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>{u.role}</span>
                <span className={`badge ${u.status === 'Active' ? 'b-green' : 'b-gray'}`}>{u.status}</span>
                <span style={{ fontSize: 11, color: 'var(--text-4)', minWidth: 70, textAlign: 'right' }}>{u.last}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Integrations' && (
        <div className="grid-2">
          {[
            { name: 'CAQH ProView', desc: 'Sync provider attestation data directly from CAQH.', status: 'Connected', icon: '🔗' },
            { name: 'Availity', desc: 'Submit applications and verify eligibility via Availity.', status: 'Connected', icon: '⚡' },
            { name: 'NPI Registry (NPPES)', desc: 'Auto-populate provider info from NPPES lookup.', status: 'Connected', icon: '✓' },
            { name: 'Supabase', desc: 'Secure database backend with real-time sync.', status: 'Connected', icon: '🛡' },
            { name: 'Anthropic AI', desc: 'AI-powered email drafting and follow-up suggestions.', status: 'Connected', icon: '🤖' },
            { name: 'SendGrid', desc: 'Automated email notifications and reminders.', status: 'Not Connected', icon: '📧' },
          ].map((int, i) => (
            <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'visible' }}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ fontSize: 22, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--elevated)', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }}>{int.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{int.name}</span>
                    <span className={`badge ${int.status === 'Connected' ? 'b-green' : 'b-gray'}`}>{int.status}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-4)', margin: 0, lineHeight: 1.5 }}>{int.desc}</p>
                  <button className="btn btn-sm btn-secondary" style={{ marginTop: 10 }}>
                    {int.status === 'Connected' ? 'Configure' : 'Connect'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'Notifications' && (
        <div className="card">
          <div className="card-header">
            <SectionHeader icon={Icon.bell} title="Notification Preferences" subtitle="Choose when and how PrimeCredential alerts your team." />
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gap: 0 }}>
              <Toggle label="License / Malpractice expiration emails" checked={nb('emailExpiry')} onChange={v => set('emailExpiry', v)} />
              <Toggle label="CAQH attestation due reminders" checked={nb('caqhReminders')} onChange={v => set('caqhReminders', v)} />
              <Toggle label="Application status change alerts" checked={nb('appStatusAlerts')} onChange={v => set('appStatusAlerts', v)} />
              <Toggle label="Task overdue notifications" checked={nb('taskReminders')} onChange={v => set('taskReminders', v)} />
              <Toggle label="Document upload confirmations" checked={nb('docExpiry')} onChange={v => set('docExpiry', v)} />
              <Toggle label="Weekly credentialing digest" checked={nb('weeklyDigest')} onChange={v => set('weeklyDigest', v)} />
              <Toggle label="New provider onboarding checklist" checked={nb('onboardingChecklist')} onChange={v => set('onboardingChecklist', v)} />
            </div>
            <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Preferences</button>
          </div>
        </div>
      )}

      {activeTab === 'Templates' && (
        <div className="card">
          <div className="card-header">
            <SectionHeader icon={Icon.plug} title="Email Templates" subtitle="Customize automated communications sent by PrimeCredential." />
            <div style={{ marginLeft: 'auto' }}>
              <button className="btn btn-primary btn-sm">+ New Template</button>
            </div>
          </div>
          <div className="card-body">
            {[
              { name: 'License Expiration Reminder', trigger: 'Auto — 90/60/30 days before expiry', lastEdit: 'Jun 2, 2024' },
              { name: 'CAQH Attestation Due', trigger: 'Auto — 30/14/7 days before due', lastEdit: 'May 18, 2024' },
              { name: 'Application Follow-Up', trigger: 'Manual / AI Draft', lastEdit: 'Jun 6, 2024' },
              { name: 'New Provider Welcome', trigger: 'Auto — on provider creation', lastEdit: 'Apr 30, 2024' },
              { name: 'Payer Application Submitted', trigger: 'Auto — on application submit', lastEdit: 'Mar 12, 2024' },
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-l)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{t.trigger}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Edited {t.lastEdit}</span>
                <button className="btn btn-sm btn-secondary">Edit</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Security' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <SectionHeader icon={Icon.lock} title="Security Settings" subtitle="Protect your PrimeCredential workspace." />
            </div>
            <div className="card-body">
              <Toggle label="Two-factor authentication (2FA)" checked={f('twoFactor') === true} onChange={v => set('twoFactor', v)} />
              <Toggle label="Enable audit log" checked={nb('enableAuditLog')} onChange={v => set('enableAuditLog', v)} />
              <Toggle label="Session timeout (30 min)" checked={nb('sessionTimeout')} onChange={v => set('sessionTimeout', v)} />
              <Toggle label="IP allowlist enforcement" checked={f('ipAllowlist') === true} onChange={v => set('ipAllowlist', v)} />
              <button className="btn btn-primary mt-12">Save Security Settings</button>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <SectionHeader icon={Icon.database} title="Data Management" subtitle="Export and manage your PrimeCredential data." />
            </div>
            <div className="card-body">
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.55 }}>
                Export a full JSON backup of all providers, enrollments, documents, tasks, payers, and audit logs from PrimeCredential.
              </p>
              <button className="btn btn-secondary" onClick={exportJSON} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                {Icon.download} Export Full Backup
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5 }}>
                Backups include all PrimeCredential workspace data and are suitable for disaster recovery or migration purposes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings

// ─── GROUP 2 / ORGANIZATION ──────────────────────────────────────────────────
// This is injected as a new settings section for Group NPI / Organization billing
export function Group2Settings({ settingsForm, setSettingsForm, handleSaveSettings }) {
  const f   = k => settingsForm?.[k] ?? ''
  const set = (k, v) => setSettingsForm(prev => ({ ...prev, [k]: v }))
  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:22, height:22, borderRadius:6, background:'var(--pr)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700 }}>G2</span>
          <h3>Group / Organization (Type 2 NPI)</h3>
        </div>
        <span className="ch-meta">Group billing entity settings</span>
      </div>
      <div className="card-body">
        <div className="form-grid">
          <div className="fg full">
            <label>Organization / Group Name</label>
            <input type="text" value={f('groupName')} onChange={e=>set('groupName',e.target.value)} placeholder="PrimeCredential Health Partners LLC" />
          </div>
          <div className="fg">
            <label>Group NPI (Type 2)</label>
            <input type="text" value={f('groupNpi')} onChange={e=>set('groupNpi',e.target.value)} placeholder="1234567890" maxLength={10} />
          </div>
          <div className="fg">
            <label>Group Tax ID / EIN</label>
            <input type="text" value={f('groupEin')} onChange={e=>set('groupEin',e.target.value)} placeholder="12-3456789" />
          </div>
          <div className="fg">
            <label>CAQH Group ID</label>
            <input type="text" value={f('groupCaqh')} onChange={e=>set('groupCaqh',e.target.value)} placeholder="Group CAQH ID" />
          </div>
          <div className="fg">
            <label>Group Medicaid ID</label>
            <input type="text" value={f('groupMedicaid')} onChange={e=>set('groupMedicaid',e.target.value)} placeholder="State Medicaid group ID" />
          </div>
          <div className="fg full">
            <label>Group Address</label>
            <input type="text" value={f('groupAddress')} onChange={e=>set('groupAddress',e.target.value)} placeholder="123 Main St, Suite 100, Portland, OR 97201" />
          </div>
          <div className="fg">
            <label>Billing Contact Name</label>
            <input type="text" value={f('groupBillingContact')} onChange={e=>set('groupBillingContact',e.target.value)} placeholder="Billing Manager" />
          </div>
          <div className="fg">
            <label>Billing Contact Email</label>
            <input type="email" value={f('groupBillingEmail')} onChange={e=>set('groupBillingEmail',e.target.value)} placeholder="billing@example.com" />
          </div>
          <div className="fg full">
            <label>Group Notes</label>
            <textarea value={f('groupNotes')} onChange={e=>set('groupNotes',e.target.value)} placeholder="Group NPI credentialing notes, payer-specific group enrollment details…" rows={3} style={{ resize:'vertical', fontFamily:'inherit' }} />
          </div>
        </div>
        <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Group Settings</button>
      </div>
    </div>
  )
}
