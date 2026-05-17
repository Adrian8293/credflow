/**
 * pages/api/upload-document.js
 *
 * Server-side file upload handler. Uses the Supabase service role key so
 * it bypasses RLS entirely — no JWT or session issues possible.
 *
 * CHANGES vs original:
 *  S-02: Stores the storage PATH in the DB instead of a 10-year signed URL.
 *        Signed URLs are generated on-demand with a 1-hour TTL via get-document-url.js.
 *  S-06: Validates actual file magic bytes server-side using the file-type library.
 *        Client-supplied Content-Type is untrusted and can be spoofed.
 *  A-05: Replaced the fragile custom multipart parser with formidable (already installed).
 *        The custom parser corrupted binary files containing the boundary string and
 *        failed on Unicode filenames and Windows CRLF edge cases.
 */

import { createClient } from '@supabase/supabase-js'
import { IncomingForm } from 'formidable'
import { fileTypeFromBuffer } from 'file-type'
import fs from 'fs'

// Service role client — server-side only, never expose to browser
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. ' +
      'Add SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables.'
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

export const config = {
  api: {
    bodyParser: false, // required for multipart file uploads
  },
}

// S-06: Allowed MIME types validated via magic bytes (not client-supplied Content-Type)
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
])

// A-05: Use formidable (already in package.json) instead of the custom multipart parser.
// The custom parser corrupted binary files containing the boundary string, failed on
// filenames with accented/Unicode characters, and broke on Windows CRLF edge cases.
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: 10 * 1024 * 1024, // 10 MB
      keepExtensions: true,
    })
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err)
      resolve({ fields, files })
    })
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { fields, files } = await parseForm(req)

    // formidable returns arrays for all fields in v3+
    const documentId = Array.isArray(fields.documentId) ? fields.documentId[0] : fields.documentId
    const providerId  = Array.isArray(fields.providerId)  ? fields.providerId[0]  : fields.providerId

    if (!documentId || !providerId) {
      return res.status(400).json({ error: 'Missing documentId or providerId' })
    }

    // formidable stores uploaded files as an array under the field name
    const fileField = files.file
    const uploadedFile = Array.isArray(fileField) ? fileField[0] : fileField
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file received' })
    }

    // Read the file buffer for magic byte validation
    const fileBuffer = fs.readFileSync(uploadedFile.filepath)
    const originalName = uploadedFile.originalFilename || uploadedFile.newFilename || 'upload'

    // S-06 FIX: Validate actual file type via magic bytes — client-supplied Content-Type
    // is untrusted. A malicious client can upload an executable or XSS-capable SVG
    // with a spoofed MIME type of application/pdf.
    const detected = await fileTypeFromBuffer(fileBuffer)
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      return res.status(400).json({
        error: `File type not allowed: ${detected?.mime ?? 'unknown'}. Accepted: PDF, JPEG, PNG, WebP, TIFF.`
      })
    }

    const supabase = getServiceClient()

    // Sanitize filename — remove special characters that could cause path issues
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${providerId}/${documentId}/${Date.now()}_${safeName}`

    // Upload to storage — service role bypasses all RLS
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: detected.mime, // use validated server-detected MIME, not client-supplied
        upsert: true,
      })

    if (uploadError) {
      console.error('[upload-document] Storage upload failed:', uploadError)
      return res.status(500).json({ error: uploadError.message })
    }

    // S-02 FIX: Store the storage PATH in the DB, not a long-lived signed URL.
    // Previously stored a 10-year signed URL which:
    //  (a) Exposed PHI-adjacent docs to anyone who obtained the URL for a decade.
    //  (b) Had no revocation mechanism short of deleting the storage object.
    //  (c) Would be silently invalidated by Supabase key rotation events.
    // Signed URLs are now generated on-demand with 1-hour TTL via get-document-url.js.
    const { error: updateError } = await supabase
      .from('documents')
      .update({ file_path: storagePath, file_name: originalName })
      .eq('id', documentId)

    if (updateError) {
      console.error('[upload-document] DB update failed:', updateError)
      return res.status(500).json({ error: updateError.message })
    }

    // Clean up the temp file formidable wrote to disk
    try { fs.unlinkSync(uploadedFile.filepath) } catch (_) { /* non-fatal */ }

    return res.status(200).json({
      storagePath,
      fileName: originalName,
    })

  } catch (err) {
    console.error('[upload-document] Unexpected error:', err)
    return res.status(500).json({ error: err.message || 'Upload failed' })
  }
}
