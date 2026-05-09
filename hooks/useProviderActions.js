import { useState } from 'react'
import {
  upsertProvider, deleteProvider,
  uploadProviderPhoto, deleteProviderPhoto,
  addAudit,
} from '../lib/db'

/**
 * All provider-related state and handlers.
 * Extracted from pages/index.js to keep the God component manageable.
 */
export function useProviderActions({ db, setDb, toast, requestConfirm, setPage }) {
  const [provForm, setProvForm]           = useState({})
  const [editingProviderId, setEditingProviderId] = useState(null)
  const [saving, setSaving]               = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [npiInput, setNpiInput]           = useState('')
  const [npiResult, setNpiResult]         = useState(null)
  const [npiLoading, setNpiLoading]       = useState(false)
  const [npiSyncModal, setNpiSyncModal]   = useState(null)

  async function handlePhotoUpload(file, providerId) {
    if (!providerId) { alert('Save the provider first before uploading a photo.'); return }
    setPhotoUploading(true)
    try {
      const url = await uploadProviderPhoto(providerId, file)
      setProvForm(f => ({ ...f, avatarUrl: url }))
      setDb(prev => ({
        ...prev,
        providers: prev.providers.map(p => p.id === providerId ? { ...p, avatarUrl: url } : p),
      }))
      toast('Photo uploaded!', 'success')
    } catch(err) { toast(err.message, 'error') }
    setPhotoUploading(false)
  }

  async function handleDeletePhoto(providerId) {
    if (!(await requestConfirm({
      title: 'Remove Photo',
      body: 'This removes the stored provider photo and clears the avatar from the provider record.',
      confirmText: 'Remove photo',
      danger: true,
    }))) return
    try {
      await deleteProviderPhoto(providerId)
      setProvForm(f => ({ ...f, avatarUrl: '' }))
      setDb(prev => ({
        ...prev,
        providers: prev.providers.map(p => p.id === providerId ? { ...p, avatarUrl: '' } : p),
      }))
      toast('Photo removed.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleSaveProvider() {
    if (!provForm.fname?.trim() || !provForm.lname?.trim()) {
      toast('First and last name required.', 'error'); return
    }
    if (!editingProviderId) {
      const fname = provForm.fname.trim().toLowerCase()
      const lname = provForm.lname.trim().toLowerCase()
      const npi   = provForm.npi?.trim()
      const duplicate = db.providers.find(p => {
        if (npi && p.npi && p.npi === npi) return true
        return p.fname.trim().toLowerCase() === fname && p.lname.trim().toLowerCase() === lname
      })
      if (duplicate) {
        toast(`Duplicate: ${duplicate.fname} ${duplicate.lname}${duplicate.cred ? ', ' + duplicate.cred : ''} is already on file.`, 'error')
        return
      }
    }
    setSaving(true)
    try {
      const saved = await upsertProvider({ ...provForm, id: editingProviderId || undefined })
      setDb(prev => ({
        ...prev,
        providers: editingProviderId
          ? prev.providers.map(x => x.id === saved.id ? saved : x)
          : [...prev.providers, saved],
      }))
      toast(editingProviderId ? 'Provider updated!' : 'Provider saved!', 'success')
      setEditingProviderId(null)
      setProvForm({})
      setNpiResult(null)
      setNpiInput('')
      setPage('providers')
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteProvider(id) {
    if (!(await requestConfirm({
      title: 'Delete Provider',
      body: 'This soft-deletes the provider. Their enrollment and document history will be preserved for audit purposes and can be restored by an administrator.',
      confirmText: 'Delete provider',
      danger: true,
    }))) return
    setSaving(true)
    try {
      await deleteProvider(id)
      setDb(prev => ({ ...prev, providers: prev.providers.filter(x => x.id !== id) }))
      toast('Provider deleted.', 'warn')
      setEditingProviderId(null)
      setPage('providers')
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleAlertMarkDone(providerId, field) {
    const prov = db.providers.find(p => p.id === providerId)
    if (!prov || !field) return
    try {
      const saved = await upsertProvider({ ...prov, [field]: null })
      setDb(prev => ({
        ...prev,
        providers: prev.providers.map(p => p.id === saved.id ? saved : p),
      }))
      toast('Alert dismissed.', 'success')
    } catch(err) { toast(err.message, 'error') }
  }

  async function lookupNPI() {
    if (!/^\d{10}$/.test(npiInput)) { toast('Enter a valid 10-digit NPI.', 'error'); return }
    setNpiLoading(true)
    setNpiResult(null)
    try {
      const res = await fetch(`/api/npi?number=${npiInput}`)
      const data = await res.json()
      if (!data.results?.length) { setNpiResult({ error: 'No provider found for this NPI.' }); return }
      const { mapNpiResponse, npiCardToProviderDefaults } = await import('../lib/npiMapper')
      const card = mapNpiResponse(data)
      if (!card) { setNpiResult({ error: 'No provider found for this NPI.' }); return }
      const addr = [card.address, card.city, card.state, card.zip].filter(Boolean).join(', ')
      setNpiResult({ ...card, addr, npi: npiInput })
      const defaults = npiCardToProviderDefaults(card)
      setProvForm(f => ({
        ...f,
        ...Object.fromEntries(Object.entries(defaults).filter(([k, v]) => v && !f[k])),
        npi: npiInput,
      }))
      await addAudit('Provider', 'NPI Lookup', `NPI ${npiInput} → ${card.fname} ${card.lname} (${card.taxonomyDesc})`, '')
      toast('NPI data loaded!', 'success')
    } catch(e) { setNpiResult({ error: e.message || 'Could not reach NPI registry.' }) }
    setNpiLoading(false)
  }

  async function syncFromNPPES(provId) {
    const prov = db.providers.find(p => p.id === provId)
    if (!prov) return
    if (!prov.npi) { toast('This provider has no NPI on file — add it first.', 'error'); return }
    toast('Fetching NPPES data…', 'success')
    try {
      const res = await fetch(`/api/npi?number=${prov.npi}`)
      const data = await res.json()
      const { mapNpiResponse, diffNpiVsProvider } = await import('../lib/npiMapper')
      const card = mapNpiResponse(data)
      if (!card) { toast('No NPPES record found for NPI ' + prov.npi, 'error'); return }
      const baseDiffs = diffNpiVsProvider(card, prov)
      const npiIdentifiers = card.identifiers || []
      const findId = (...keywords) => {
        const match = npiIdentifiers.find(i =>
          keywords.some(kw => (i.desc || '').toLowerCase().includes(kw.toLowerCase()))
        )
        return match?.identifier || ''
      }
      const nppesMedicaid = card.medicaid || findId('medicaid', 'dmap', 'ohp')
      const nppesPtan     = findId('medicare', 'ptan', 'part b')
      const nppesCaqh     = findId('caqh')
      const EXTRA_FIELDS = [
        { field: 'phone',        label: 'Phone',                npiVal: card.phone },
        { field: 'license',      label: 'License #',            npiVal: card.license },
        { field: 'address',      label: 'Address',              npiVal: card.address },
        { field: 'city',         label: 'City',                 npiVal: card.city },
        { field: 'state',        label: 'State',                npiVal: card.state },
        { field: 'zip',          label: 'ZIP',                  npiVal: card.zip },
        { field: 'medicaid',     label: 'Medicaid ID',          npiVal: nppesMedicaid },
        { field: 'ptan',         label: 'Medicare PTAN',        npiVal: nppesPtan },
        { field: 'caqh',         label: 'CAQH ID',              npiVal: nppesCaqh },
        { field: 'focus',        label: 'Specialty Focus',      npiVal: card.taxonomyDesc },
        { field: 'taxonomyCode', label: 'Taxonomy Code',        npiVal: card.taxonomyCode },
        { field: 'taxonomyDesc', label: 'Taxonomy Description', npiVal: card.taxonomyDesc },
      ]
      const extraDiffs = EXTRA_FIELDS
        .filter(f => {
          const nv = (f.npiVal || '').trim().toLowerCase()
          const sv = (prov[f.field] || '').trim().toLowerCase()
          return nv && sv && nv !== sv
        })
        .map(f => ({ field: f.field, label: f.label, npiValue: f.npiVal, storedValue: prov[f.field] }))
      const newFields = EXTRA_FIELDS
        .filter(f => {
          const nv = (f.npiVal || '').trim()
          const sv = (prov[f.field] || '').trim()
          return nv && !sv
        })
        .map(f => ({ field: f.field, label: f.label, npiValue: f.npiVal, storedValue: '(empty)', isNew: true }))
      const allDiffs = [...baseDiffs, ...extraDiffs, ...newFields]
        .filter((d, i, arr) => arr.findIndex(x => x.field === d.field) === i)
      if (allDiffs.length === 0) {
        toast(`✓ ${prov.fname} ${prov.lname} is already up to date with NPPES.`, 'success')
        return
      }
      setNpiSyncModal({ prov, diffs: allDiffs, card })
    } catch(err) { toast('NPPES sync failed: ' + (err.message || 'Unknown error'), 'error') }
  }

  async function applyNpiSync(selectedFields) {
    if (!npiSyncModal) return
    const { prov, diffs, card } = npiSyncModal
    setSaving(true)
    try {
      const updates = {}
      selectedFields.forEach(field => {
        const diff = diffs.find(d => d.field === field)
        updates[field] = diff ? diff.npiValue : card[field]
      })
      const saved = await upsertProvider({ ...prov, ...updates })
      setDb(prev => ({ ...prev, providers: prev.providers.map(p => p.id === saved.id ? saved : p) }))
      await addAudit('Provider', 'NPPES Sync', `Synced ${selectedFields.join(', ')} from NPPES for NPI ${prov.npi}`, prov.id)
      toast(`✓ ${prov.fname} ${prov.lname} updated from NPPES!`, 'success')
      setNpiSyncModal(null)
    } catch(err) { toast('Save failed: ' + err.message, 'error') }
    setSaving(false)
  }

  function editProvider(id) {
    const prov = db.providers.find(x => x.id === id)
    if (!prov) return
    setEditingProviderId(id)
    setProvForm({ ...prov })
    setNpiInput(prov.npi || '')
    setNpiResult(null)
    setPage('add-provider')
  }

  return {
    provForm, setProvForm,
    editingProviderId, setEditingProviderId,
    saving, photoUploading,
    npiInput, setNpiInput,
    npiResult, setNpiResult,
    npiLoading,
    npiSyncModal, setNpiSyncModal,
    handlePhotoUpload, handleDeletePhoto,
    handleSaveProvider, handleDeleteProvider,
    handleAlertMarkDone,
    lookupNPI, syncFromNPPES, applyNpiSync,
    editProvider,
  }
}
