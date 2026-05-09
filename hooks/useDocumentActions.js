import { useState } from 'react'
import { upsertDocument, deleteDocument } from '../lib/db'
import { pNameShort } from '../lib/helpers'

export function useDocumentActions({ db, setDb, toast, requestConfirm }) {
  const [docForm, setDocForm]       = useState({})
  const [editingDocId, setEditingDocId] = useState(null)
  const [saving, setSaving]         = useState(false)

  async function handleSaveDocument() {
    if (!docForm.provId || !docForm.exp) {
      toast('Provider and expiration date required.', 'error'); return
    }
    setSaving(true)
    try {
      const provN = pNameShort(db.providers, docForm.provId)
      const saved = await upsertDocument({ ...docForm, id: editingDocId || undefined }, provN)
      setDb(prev => ({
        ...prev,
        documents: editingDocId
          ? prev.documents.map(x => x.id === saved.id ? saved : x)
          : [...prev.documents, saved],
      }))
      toast(editingDocId ? 'Document updated!' : 'Document saved!', 'success')
      setDocForm({})
      setEditingDocId(null)
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteDocument(id) {
    if (!(await requestConfirm({
      title: 'Delete Document',
      body: 'This soft-deletes the credential document. Expiration tracking will stop but the record is preserved for audit purposes.',
      confirmText: 'Delete document',
      danger: true,
    }))) return
    try {
      await deleteDocument(id)
      setDb(prev => ({ ...prev, documents: prev.documents.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  function openDocModal(id) {
    setEditingDocId(id || null)
    if (id) {
      const doc = db.documents.find(x => x.id === id)
      if (doc) setDocForm({ ...doc })
    } else {
      setDocForm({ type: 'License' })
    }
  }

  return {
    docForm, setDocForm,
    editingDocId,
    saving,
    handleSaveDocument, handleDeleteDocument,
    openDocModal,
  }
}
