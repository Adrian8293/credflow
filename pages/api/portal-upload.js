/**
 * pages/api/portal-upload.js
 *
 * Provider / clinic-staff document upload. Authorization is decided by the database
 * (portal_authorize_upload runs with the CALLER's session); only after it passes does this
 * route use the service role to store the file and record it.
 *
 * multipart/form-data: file, providerId, [requestId], [docType], [title], [exp]
 *  - with requestId : answers an open request (status requested/rejected -> submitted)
 *  - without        : self-initiated upload, recorded as a submitted request for staff review
 */
import { createClient } from '@supabase/supabase-js'
import { IncomingForm } from 'formidable'
import { fileTypeFromBuffer } from 'file-type'
import fs from 'fs'
import crypto from 'crypto'
import { apiHandler, validateOrigin } from '../../lib/api-middleware'
import { createSessionClient } from '../../lib/supabase-server'
import { DOC_TYPES } from '../../constants/docTypes'

export const config = { api: { bodyParser: false } }

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseForm(req) {
  return new Promise((resolve, reject) => {
    new IncomingForm({ maxFileSize: 10 * 1024 * 1024, keepExtensions: true })
      .parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })))
  })
}
const one = (v) => (Array.isArray(v) ? v[0] : v)

async function handler(req, res, user) {
  if (!validateOrigin(req, res)) return

  let tmpPath = null
  try {
    const { fields, files } = await parseForm(req)
    const providerId = one(fields.providerId)
    const requestId  = one(fields.requestId) || null
    const exp        = one(fields.exp) || null
    const file       = one(files.file)
    tmpPath = file?.filepath || null

    if (!providerId) return res.status(400).json({ error: 'Missing providerId' })
    if (!file)       return res.status(400).json({ error: 'No file received' })
    if (exp && !DATE_RE.test(exp)) return res.status(400).json({ error: 'Expiration date must be YYYY-MM-DD' })

    // 1) Authorization by the database, as the caller.
    const session = createSessionClient(req, res)
    const { data: auth, error: authErr } = await session.rpc('portal_authorize_upload', {
      p_provider: providerId, p_request: requestId,
    })
    if (authErr || !auth) {
      const forbidden = authErr?.code === '42501'
      return res.status(forbidden ? 403 : 400).json({ error: forbidden ? 'You do not have access to do that.' : (authErr?.message || 'Not allowed') })
    }

    // Type and title come from the request when answering one; otherwise from the form.
    let docType = auth.doc_type || one(fields.docType) || 'Other'
    let title   = auth.title || (one(fields.title) || '').trim()
    if (!DOC_TYPES.includes(docType)) docType = 'Other'
    if (!title) title = docType
    title = title.slice(0, 120)

    // 2) File validation by magic bytes (client Content-Type is untrusted).
    const buf = fs.readFileSync(file.filepath)
    const detected = await fileTypeFromBuffer(buf)
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      return res.status(400).json({ error: 'Please upload a PDF, JPEG, PNG, WebP or TIFF file.' })
    }

    // 3) Store + record with the service role (org and provider already authorized above).
    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } })

    const docId = crypto.randomUUID()
    const originalName = file.originalFilename || file.newFilename || 'upload'
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${auth.prov_id}/${docId}/${Date.now()}_${safeName}`

    const { error: upErr } = await svc.storage.from('documents')
      .upload(storagePath, buf, { contentType: detected.mime, upsert: false })
    if (upErr) { console.error('[portal-upload] storage:', upErr.message); return res.status(500).json({ error: 'Upload failed. Please try again.' }) }

    const { error: docErr } = await svc.from('documents').insert([{
      id: docId, org_id: auth.org_id, prov_id: auth.prov_id, type: docType,
      exp, file_path: storagePath, file_name: originalName, notes: 'Uploaded via provider portal',
    }])
    if (docErr) {
      await svc.storage.from('documents').remove([storagePath])
      console.error('[portal-upload] document row:', docErr.message)
      return res.status(500).json({ error: 'Could not save the document. Please try again.' })
    }

    const now = new Date().toISOString()
    if (requestId) {
      const { error } = await svc.from('doc_requests').update({
        status: 'submitted', document_id: docId, doc_exp: exp, submitted_at: now,
        reject_reason: null, reviewed_at: null, reviewed_by: null,
      }).eq('id', requestId).eq('org_id', auth.org_id)
      if (error) console.error('[portal-upload] request update:', error.message)
    } else {
      const { error } = await svc.from('doc_requests').insert([{
        org_id: auth.org_id, prov_id: auth.prov_id, doc_type: docType, title,
        status: 'submitted', document_id: docId, doc_exp: exp, submitted_at: now, requested_by: null,
      }])
      if (error) console.error('[portal-upload] request insert:', error.message)
    }

    await svc.from('audit_log').insert([{
      org_id: auth.org_id, type: 'Portal', action: 'Document uploaded',
      detail: `${title} (${docType}) uploaded via portal`, entity: docId,
      performed_by: user.id, user_email: user.email,
    }])

    return res.status(200).json({ ok: true, documentId: docId })
  } catch (err) {
    console.error('[portal-upload] unexpected:', err)
    const tooBig = /maxFileSize/i.test(err?.message || '')
    return res.status(tooBig ? 413 : 500).json({ error: tooBig ? 'File is too large (10 MB max).' : 'Upload failed.' })
  } finally {
    if (tmpPath) { try { fs.unlinkSync(tmpPath) } catch (_) { /* non-fatal */ } }
  }
}

export default apiHandler({ methods: ['POST'], auth: true, rateLimit: { max: 30, windowMs: 60_000, keyPrefix: 'portal-upload:' }, handler })
