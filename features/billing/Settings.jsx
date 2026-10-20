/**
 * Settings.jsx — Lacentra
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

import { MfaSetup } from '../security/MfaSetup.jsx'
import { useState } from 'react'
import { IDLE_CHOICES, getIdleMinutes, setIdleMinutes } from '../../lib/idle'

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

// How long this device may sit idle (or the app stay closed) before sign-in is required again.
function IdleMinutesPicker() {
  const [mins, setMins] = useState(() => (typeof window === 'undefined' ? 30 : getIdleMinutes()))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0 6px' }}>
      <label htmlFor="idle-minutes" style={{ fontSize: 13, fontWeight: 600 }}>Sign me out on this device after</label>
      <select id="idle-minutes" className="filter-select" style={{ width: 'auto' }} value={mins}
        onChange={e => { const v = Number(e.target.value); setMins(v); setIdleMinutes(v) }}>
        {IDLE_CHOICES.map(m => <option key={m} value={m}>{m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`} of no activity</option>)}
      </select>
      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>Takes effect the next time you open the app.</span>
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

const TABS = ['General', 'Notifications', 'Security', 'Integrations']

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
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Manage system settings and configurations for Lacentra.</p>
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
              <SectionHeader icon={Icon.building} title="Organization Information" subtitle="Your practice details used across Lacentra." />
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="fg full">
                  <label>Organization Name</label>
                  <input type="text" value={f('practice')} onChange={e => set('practice', e.target.value)} placeholder="Positive Inner Self, LLC" />
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
                  <input type="email" value={f('email')} onChange={e => set('email', e.target.value)} placeholder="admin@positiveinnerselfllc.com" />
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
                <Toggle label="Deadline alert emails (30, 14, 7, 3, 1 and 0 days before)" checked={nb('emailExpiry')} onChange={v => set('emailExpiry', v)} />
              </div>
              <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Integrations' && (
        <div className="card">
          <div className="card-header">
            <SectionHeader icon={Icon.plug} title="Integrations" subtitle="What Lacentra connects to." />
          </div>
          <div className="card-body">
            {[
              { name: 'Supabase', desc: 'Database, sign-in and file storage for your workspace.', badge: 'Connected', cls: 'b-green' },
              { name: 'NPI Registry (NPPES)', desc: 'Public lookup used by Add Provider and Sync from NPPES.', badge: 'Connected', cls: 'b-green' },
              { name: 'AI follow-up emails (Anthropic)', desc: 'Optional and paid. Off unless your administrator turns it on in the deployment settings (FEATURE_AI). Sends provider details to the vendor when on.', badge: 'Optional', cls: 'b-gray' },
              { name: 'Email digest (Resend)', desc: 'Optional, free plan available. Off unless turned on in the deployment settings (FEATURE_EMAIL_DIGEST). Needs a verified sending domain.', badge: 'Optional', cls: 'b-gray' },
            ].map(int => (
              <div key={int.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-l)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>{int.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>{int.desc}</div>
                </div>
                <span className={`badge ${int.cls}`}>{int.badge}</span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--text-4)', lineHeight: 1.55, margin: '14px 0 0' }}>
              Not integrated: CAQH ProView and Availity. CAQH IDs and attestation dates are tracked here by hand.
              Legal entities and EINs (last 4 digits only) live under <strong>Groups</strong>; team members and provider portal access live under <strong>Access</strong>.
            </p>
          </div>
        </div>
      )}
      {activeTab === 'Notifications' && (
        <div className="card">
          <div className="card-header">
            <SectionHeader icon={Icon.bell} title="Notification Preferences" subtitle="Email alerts need the optional email setup (FEATURE_EMAIL_DIGEST). In-app alerts are always on." />
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gap: 0 }}>
              <Toggle label="Deadline alert emails (30, 14, 7, 3, 1 and 0 days before)" checked={nb('emailExpiry')} onChange={v => set('emailExpiry', v)} />
              <Toggle label="Weekly credentialing digest email (Mondays)" checked={nb('weeklyDigest')} onChange={v => set('weeklyDigest', v)} />
            </div>
            <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Preferences</button>
          </div>
        </div>
      )}

      {activeTab === 'Security' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <SectionHeader icon={Icon.lock} title="Security Settings" subtitle="Protect your Lacentra workspace." />
            </div>
            <div className="card-body">
              <MfaSetup />
              <hr style={{ border: 'none', borderTop: '1px solid var(--border-l)', margin: '18px 0' }} />
              <Toggle label="Sign out automatically after a period of inactivity" checked={nb('sessionTimeout')} onChange={v => set('sessionTimeout', v)} />
              <IdleMinutesPicker />
              <p style={{ fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5, margin: '4px 0 0' }}>
                The on/off switch applies to everyone in this organization. The audit log is always on and cannot be switched off.
              </p>
              <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Security Settings</button>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <SectionHeader icon={Icon.database} title="Data Management" subtitle="Export and manage your Lacentra data." />
            </div>
            <div className="card-body">
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.55 }}>
                Export a full JSON backup of all providers, enrollments, documents, tasks, payers, and audit logs from Lacentra.
              </p>
              <button className="btn btn-secondary" onClick={exportJSON} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                {Icon.download} Export Full Backup
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5 }}>
                Backups include all Lacentra workspace data and are suitable for disaster recovery or migration purposes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
