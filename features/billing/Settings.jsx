const Icon = {
  building: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  bell:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  database: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
}

function SectionHeader({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--pr)', display: 'flex' }}>{icon}</span>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
    </div>
  )
}

export function Settings({ settingsForm, setSettingsForm, handleSaveSettings, exportJSON }) {
  const f = k => settingsForm[k] ?? ''
  const set = (k, v) => setSettingsForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="page">
      <div className="grid-2">

        {/* Practice Information */}
        <div className="card">
          <div className="card-header">
            <SectionHeader icon={Icon.building} title="Practice Information" />
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="fg full">
                <label>Practice Name</label>
                <input type="text" value={f('practice')} onChange={e => set('practice', e.target.value)} placeholder="Positive Inner Self, LLC" />
              </div>
              <div className="fg full">
                <label>Address</label>
                <input type="text" value={f('address')} onChange={e => set('address', e.target.value)} placeholder="123 Main St, Beaverton, OR 97005" />
              </div>
              <div className="fg">
                <label>Phone</label>
                <input type="tel" value={f('phone')} onChange={e => set('phone', e.target.value)} placeholder="(503) 555-0100" />
              </div>
              <div className="fg">
                <label>Intake Email</label>
                <input type="email" value={f('email')} onChange={e => set('email', e.target.value)} placeholder="credentialing@practice.com" />
              </div>
            </div>
            <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Changes</button>
          </div>
        </div>

        {/* Alert Thresholds */}
        <div className="card">
          <div className="card-header">
            <SectionHeader icon={Icon.bell} title="Alert Thresholds" />
          </div>
          <div className="card-body">
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.55 }}>
              Control how far in advance alerts appear on the dashboard and Alerts page.
            </p>
            <div className="form-grid">
              <div className="fg">
                <label>License / Malpractice alert (days)</label>
                <input
                  type="number"
                  value={f('alertDays')}
                  onChange={e => set('alertDays', parseInt(e.target.value) || 90)}
                  min={30} max={365}
                />
                <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Recommended: 90 days</div>
              </div>
              <div className="fg">
                <label>CAQH attestation alert (days)</label>
                <input
                  type="number"
                  value={f('caqhDays')}
                  onChange={e => set('caqhDays', parseInt(e.target.value) || 30)}
                  min={7} max={90}
                />
                <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Recommended: 30 days</div>
              </div>
            </div>
            <button className="btn btn-primary mt-12" onClick={handleSaveSettings}>Save Changes</button>
          </div>
        </div>

      </div>

      {/* Data Management */}
      <div className="card mt-12">
        <div className="card-header">
          <SectionHeader icon={Icon.database} title="Data Management" />
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.55 }}>
            Export a full JSON backup of all providers, enrollments, documents, tasks, and payers.
          </p>
          <button className="btn btn-secondary" onClick={exportJSON} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {Icon.download} Export Full Backup
          </button>
        </div>
      </div>

    </div>
  )
}

export default Settings
