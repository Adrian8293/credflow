/**
 * RenewCredentialModal — record a renewal for ONE credential (license, malpractice, DEA, CAQH, re-credentialing)
 * without opening the full Edit Provider form. Only the fields that change at renewal are shown.
 *
 * Props:
 *   prov      provider record
 *   target    { kind: 'license' | 'malpractice' | 'dea' | 'caqh' | 'recred' | 'extraLicense', license? }
 *   onClose   () => void
 *   onSave    (patch: object) => Promise<boolean>        provider-level fields (kinds other than extraLicense)
 *   onSaveLicense (license) => Promise<object|null>      for kind 'extraLicense'
 */
import React, { useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { DateInput } from '../../components/ui/DateInput.jsx'
import { daysUntil, fmtDate } from '../../lib/helpers.js'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Which fields each credential kind asks for. `date: true` fields are dates; `required` ones must be filled.
const KINDS = {
  license:     { title: 'Renew state license',     fields: [
    { key: 'licenseExp', label: 'New expiration date', date: true, required: true, future: true },
    { key: 'license',    label: 'License number (only if it changed)' },
  ] },
  malpractice: { title: 'Renew malpractice insurance', fields: [
    { key: 'malExp',     label: 'New expiration date', date: true, required: true, future: true },
    { key: 'malPolicy',  label: 'Policy number (only if it changed)' },
    { key: 'malCarrier', label: 'Carrier (only if it changed)' },
  ] },
  dea:         { title: 'Renew DEA registration',  fields: [
    { key: 'deaExp',     label: 'New expiration date', date: true, required: true, future: true },
    { key: 'dea',        label: 'DEA number (only if it changed)' },
  ] },
  caqh:        { title: 'Record CAQH attestation', fields: [
    { key: 'caqhAttest', label: 'Date attested', date: true, required: true },
    { key: 'caqhDue',    label: 'Next attestation due', date: true, required: true, future: true },
  ] },
  recred:      { title: 'Re-credentialing',        fields: [
    { key: 'recred',     label: 'Next re-credentialing due', date: true, required: true, future: true },
  ] },
  extraLicense:{ title: 'Renew state license',     fields: [
    { key: 'expires',    label: 'New expiration date', date: true, required: true, future: true },
    { key: 'number',     label: 'License number (only if it changed)' },
  ] },
}

const DOC_TYPE = { license: 'License', extraLicense: 'License', malpractice: 'Malpractice', dea: 'DEA', caqh: 'CAQH Attestation', recred: 'Recredentialing' }
const EXPIRY_KEY = { license: 'licenseExp', extraLicense: 'expires', malpractice: 'malExp', dea: 'deaExp', caqh: 'caqhDue', recred: 'recred' }
const NUMBER_KEY = { license: 'license', extraLicense: 'number', malpractice: 'malPolicy', dea: 'dea' }
const OK_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'tiff']

export function RenewCredentialModal({ prov, target, onClose, onSave, onSaveLicense, onSyncDocument }) {
  const cfg = KINDS[target.kind]
  const source = target.kind === 'extraLicense' ? (target.license || {}) : prov
  const [vals, setVals] = useState(() => {
    const v = {}
    cfg.fields.forEach(f => {
      // Dates start empty so an old date can't be saved by accident; text fields start with the current value.
      v[f.key] = f.date ? (f.key === 'caqhAttest' ? todayIso() : '') : (source[f.key] || '')
    })
    return v
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState(null)
  const set = (k, v) => { setVals(s => ({ ...s, [k]: v })); setErr('') }

  async function submit() {
    for (const f of cfg.fields) {
      const v = vals[f.key]
      if (f.required && !/^\d{4}-\d{2}-\d{2}$/.test(v || '')) { setErr(`Enter a valid date for “${f.label}”.`); return }
      if (f.future && v && daysUntil(v) <= 0) { setErr(`“${f.label}” must be a date in the future.`); return }
    }
    if (file) {
      const ext = file.name.split('.').pop().toLowerCase()
      if (!OK_EXT.includes(ext)) { setErr(`That file type (.${ext}) is not allowed. Use PDF, JPG, PNG, WEBP, DOC, DOCX or TIFF.`); return }
      if (file.size > 10 * 1024 * 1024) { setErr('That file is over 10 MB. Choose a smaller file or a PDF scan at lower resolution.'); return }
    }
    setBusy(true)
    let ok
    if (target.kind === 'extraLicense') {
      ok = !!(await onSaveLicense?.({ ...target.license, expires: vals.expires, number: (vals.number || '').trim() || target.license.number }))
    } else {
      const patch = {}
      cfg.fields.forEach(f => {
        const v = typeof vals[f.key] === 'string' ? vals[f.key].trim() : vals[f.key]
        if (f.date || v) patch[f.key] = v   // an empty text box means "unchanged"
      })
      ok = await onSave?.(patch, cfg.title)
    }
    if (ok && DOC_TYPE[target.kind]) {
      await onSyncDocument?.({
        type: DOC_TYPE[target.kind],
        exp: vals[EXPIRY_KEY[target.kind]],
        number: (vals[NUMBER_KEY[target.kind]] || '').trim(),
        issuer: (vals.malCarrier || '').trim(),
      }, file)
    }
    setBusy(false)
    if (ok) onClose()
  }

  const name = `${prov.fname || ''} ${prov.lname || ''}`.trim()
  const oldDate = target.kind === 'extraLicense' ? source.expires
    : { license: prov.licenseExp, malpractice: prov.malExp, dea: prov.deaExp, caqh: prov.caqhDue, recred: prov.recred }[target.kind]

  return (
    <Modal
      onClose={onClose}
      title={cfg.title}
      sub={name}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save renewal'}</button>
      </>}
    >
      {oldDate && (
        <div style={{ fontSize: 13.5, color: daysUntil(oldDate) < 0 ? 'var(--danger)' : 'var(--text-3)', marginBottom: 14 }}>
          Current expiration: <strong>{fmtDate(oldDate)}</strong>
          {daysUntil(oldDate) < 0 ? ' (expired)' : ''}
        </div>
      )}
      {cfg.fields.map(f => (
        <div className="fg" key={f.key} style={{ marginBottom: 12 }}>
          <label>{f.label}{f.required ? ' *' : ''}</label>
          {f.date
            ? <DateInput value={vals[f.key]} onChange={e => set(f.key, e.target.value)} />
            : <input value={vals[f.key]} onChange={e => set(f.key, e.target.value)} />}
        </div>
      ))}
      {err && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13.5, fontWeight: 600 }}>{err}</div>}
      <div className="fg" style={{ marginTop: 6 }}>
        <label>Attach the new document (optional)</label>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.tiff" onChange={e => { setFile(e.target.files?.[0] || null); setErr('') }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>
          PDF or photo, up to 10 MB. It replaces the file on record and the Documents list gets the new expiration.
        </div>
      </div>
    </Modal>
  )
}
