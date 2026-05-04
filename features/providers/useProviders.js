import { useState } from 'react'
import {
  upsertProvider, deleteProvider,
  uploadProviderPhoto, deleteProviderPhoto
} from '../../lib/db.js'

export function useProviders({ db, setDb, toast, setModal, setEditingId, setProvForm, setNpiSyncModal }) {

  async function handlePhotoUpload(providerId, file) {
    const url = await uploadProviderPhoto(providerId, file)
    setDb(prev => ({
      ...prev,
      providers: prev.providers.map(p => p.id === providerId ? { ...p, photoUrl: url } : p)
    }))
  }

  async function handleSaveProvider() {
    try {
      const { provForm, editingId } = arguments[0] || {}
      const fname = provForm.fname?.trim().toLowerCase()
      const lname = provForm.lname?.trim().toLowerCase()
      const npi   = provForm.npi?.trim()
      const duplicate = db.providers.find(p => {
        const sameName = p.fname?.trim().toLowerCase() === fname &&
                         p.lname?.trim().toLowerCase() === lname
        const sameNpi  = npi && p.npi === npi
        return (sameName || sameNpi) && p.id !== editingId.provider
      })
      if (duplicate) { toast(`Duplicate provider detected: ${duplicate.fname} ${duplicate.lname}`, 'error'); return }
      const saved = await upsertProvider({ ...provForm, id: editingId.provider || undefined })
      setDb(prev => ({
        ...prev,
        providers: editingId.provider
          ? prev.providers.map(x => x.id === saved.id ? saved : x)
          : [...prev.providers, saved]
      }))
      setModal(null)
      setEditingId(prev => ({ ...prev, provider: null }))
      setProvForm({})
      toast(editingId.provider ? 'Provider updated' : 'Provider added')
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleDeleteProvider(id) {
    try {
      await deleteProvider(id)
      setDb(prev => ({ ...prev, providers: prev.providers.filter(p => p.id !== id) }))
      toast('Provider deleted')
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleNpiLookup(npiInput, setNpiResult, setNpiLoading) {
    setNpiLoading(true)
    try {
      const res  = await fetch(`/api/npi?number=${npiInput}`)
      const data = await res.json()
      const { mapNpiResponse, npiCardToProviderDefaults } = await import('../../lib/npiMapper.js')
      const card     = mapNpiResponse(data)
      const defaults = npiCardToProviderDefaults(card)
      setNpiResult(card)
      setProvForm(prev => ({ ...prev, ...defaults }))
    } catch (e) { toast('NPI lookup failed', 'error') }
    finally { setNpiLoading(false) }
  }

  async function handleNpiSync(provId) {
    const prov = db.providers.find(p => p.id === provId)
    if (!prov?.npi) { toast('No NPI on record', 'error'); return }
    try {
      const res  = await fetch(`/api/npi?number=${prov.npi}`)
      const data = await res.json()
      const { mapNpiResponse, diffNpiVsProvider } = await import('../../lib/npiMapper.js')
      const card  = mapNpiResponse(data)
      const diffs = diffNpiVsProvider(card, prov)
      setNpiSyncModal({ prov, diffs, card })
    } catch (e) { toast('NPPES sync failed', 'error') }
  }

  return { handlePhotoUpload, handleSaveProvider, handleDeleteProvider, handleNpiLookup, handleNpiSync }
}

export { useProviders }
