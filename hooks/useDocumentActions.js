import { useState } from 'react'
import { upsertDocument, deleteDocument } from '../lib/db'
import { pNameShort } from '../lib/helpers'

// Document types that do not have an expiration date.
// W-9s, CVs, and NPI Letters are point-in-time documents — they don't expire.
// Exported so DocModal, Documents, and DocumentsPage all use the same list.
export const NO_EXPIRY_TYPES = new Set(['W-9', 'CV / Resume', 'NPI Letter'])

export function useDocumentActions({ db, setDb, toast, requestConfirm }) {
  const [docForm, setDocForm]       = useState({})
  const [editingDocId, setEditingDocId] = useState(null)
  const [saving, setSaving]         = useState(false)

  async function handleSaveDocument() {
    const exemptFromExpiry = NO_EXPIRY_TYPES.has(docForm.type)
    if (!docForm.provId || (!docForm.exp && !exemptFromExpiry)) {
      toast(
        !docForm.provId ? 'Provider is required.' : 'Expiration date is required for this document type.',
        'error'
      )
      return null
    }
    setSaving(true)
    let saved = null
    try {
      const provN = pNameShort(db.providers, docForm.provId)
      saved = await upsertDocument({ ...docForm, id: editingDocId || undefined }, provN)
      setDb(prev => ({
        ...prev,
        documents: editingDocId
          ? prev.documents.map(x => x.id === saved.id ? saved : x)
          : [...prev.documents, saved],
      }))
      toast(editingDocId ? 'Document updated!' : 'Document saved!', 'success')
      setDocForm({})
      setEditingDocId(null)
    } catch(err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
    // Returns null on error — DocModal checks for null before attempting file upload
    return saved
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
