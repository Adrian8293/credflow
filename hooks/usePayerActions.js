import { useState } from 'react'
import { upsertPayer, deletePayer } from '../lib/db'

export function usePayerActions({ db, setDb, toast, requestConfirm }) {
  const [payerForm, setPayerForm]           = useState({})
  const [editingPayerId, setEditingPayerId] = useState(null)
  const [saving, setSaving]                 = useState(false)

  async function handleSavePayer() {
    if (!payerForm.name?.trim()) { toast('Payer name required.', 'error'); return }
    setSaving(true)
    try {
      const saved = await upsertPayer({ ...payerForm, id: editingPayerId || undefined })
      setDb(prev => ({
        ...prev,
        payers: editingPayerId
          ? prev.payers.map(x => x.id === saved.id ? saved : x)
          : [...prev.payers, saved],
      }))
      toast(editingPayerId ? 'Payer updated!' : 'Payer saved!', 'success')
      setPayerForm({})
      setEditingPayerId(null)
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeletePayer(id) {
    if (!(await requestConfirm({
      title: 'Delete Payer',
      body: 'This soft-deletes the payer. Existing enrollments retain their payer reference and audit history is preserved.',
      confirmText: 'Delete payer',
      danger: true,
    }))) return
    try {
      await deletePayer(id)
      setDb(prev => ({ ...prev, payers: prev.payers.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  function openPayerModal(id) {
    setEditingPayerId(id || null)
    if (id) {
      const pay = db.payers.find(x => x.id === id)
      if (pay) setPayerForm({ ...pay })
    } else {
      setPayerForm({ type: 'Commercial', timeline: '60–90 days' })
    }
  }

  return {
    payerForm, setPayerForm,
    editingPayerId,
    saving,
    handleSavePayer, handleDeletePayer,
    openPayerModal,
  }
}
