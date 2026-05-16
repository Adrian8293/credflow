/**
 * pages/api/upload-document.js
 *
 * Server-side file upload handler. Uses the Supabase service role key so
 * it bypasses RLS entirely — no JWT or session issues possible.
 *
 * The service role key never reaches the browser. It only exists in
 * Vercel's server environment (process.env.SUPABASE_SERVICE_ROLE_KEY).
 *
 * Flow:
 *  1. Client sends a multipart/form-data POST with the file + metadata
 *  2. This route uploads to Supabase Storage using the service role key
 *  3. Creates a signed URL (10 year TTL) for the file
 *  4. Updates the document row with file_url + file_name
 *  5. Returns { fileUrl, fileName } to the client
 */

import { createClient } from '@supabase/supabase-js'

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

// Parse multipart form data without an external library
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      const contentType = req.headers['content-type'] || ''
      const boundaryMatch = contentType.match(/boundary=(.+)$/)
      if (!boundaryMatch) return reject(new Error('No boundary found in content-type'))

      const boundary = boundaryMatch[1]
      const parts = buffer.toString('binary').split(`--${boundary}`)
      const fields = {}
      let fileBuffer = null
      let fileName = ''
      let mimeType = 'application/octet-stream'

      for (const part of parts) {
        if (part === '--\r\n' || part.trim() === '--') continue
        const [rawHeaders, ...bodyParts] = part.split('\r\n\r\n')
        if (!rawHeaders) continue
        const body = bodyParts.join('\r\n\r\n').replace(/\r\n$/, '')

        const nameMatch = rawHeaders.match(/name="([^"]+)"/)
        const fileMatch = rawHeaders.match(/filename="([^"]+)"/)
        const typeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)

        if (fileMatch) {
          fileName = fileMatch[1]
          mimeType = typeMatch ? typeMatch[1].trim() : 'application/octet-stream'
          fileBuffer = Buffer.from(body, 'binary')
        } else if (nameMatch) {
          fields[nameMatch[1]] = body.trim()
        }
      }

      resolve({ fields, fileBuffer, fileName, mimeType })
    })
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { fields, fileBuffer, fileName, mimeType } = await parseMultipart(req)

    const { documentId, providerId } = fields

    if (!documentId || !providerId) {
      return res.status(400).json({ error: 'Missing documentId or providerId' })
    }
    if (!fileBuffer || !fileName) {
      return res.status(400).json({ error: 'No file received' })
    }
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File exceeds 10MB limit' })
    }

    const supabase = getServiceClient()

    // Sanitize filename — remove special characters that could cause path issues
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${providerId}/${documentId}/${Date.now()}_${safeName}`

    // Upload to storage — service role bypasses all RLS
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error('[upload-document] Storage upload failed:', uploadError)
      return res.status(500).json({ error: uploadError.message })
    }

    // Create a long-lived signed URL (10 years)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

    if (signedError) {
      console.error('[upload-document] Signed URL failed:', signedError)
      return res.status(500).json({ error: signedError.message })
    }

    // Update the document row with the file URL and name
    const { error: updateError } = await supabase
      .from('documents')
      .update({ file_url: signedData.signedUrl, file_name: fileName })
      .eq('id', documentId)

    if (updateError) {
      console.error('[upload-document] DB update failed:', updateError)
      return res.status(500).json({ error: updateError.message })
    }

    return res.status(200).json({
      fileUrl: signedData.signedUrl,
      fileName: fileName,
    })

  } catch (err) {
    console.error('[upload-document] Unexpected error:', err)
    return res.status(500).json({ error: err.message || 'Upload failed' })
  }
}
