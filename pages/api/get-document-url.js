/**
 * pages/api/get-document-url.js
 *
 * Generates a fresh short-lived signed URL for a document file on demand.
 * Uses the service role key so it works regardless of the user's session.
 *
 * GET /api/get-document-url?documentId=xxx
 *
 * Returns: { signedUrl: "https://...", fileName: "..." }
 *
 * S-02 FIX: TTL reduced from 10 years to 1 hour.
 * Documents now store file_path (storage path) instead of a pre-generated signed URL.
 * This endpoint is the only path to a viewable URL — authenticated, server-side, short-lived.
 *
 * Backwards compatibility: if a document row still has the old file_url column populated
 * (pre-migration records), the endpoint falls back to extracting the path from that URL
 * and regenerating a fresh 1-hour URL from it.
 */

import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../../lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// S-02: 1-hour TTL — short enough to limit exposure if a URL leaks,
// long enough for a normal document review session.
const SIGNED_URL_TTL_SECONDS = 60 * 60  // 1 hour

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth guard — document URLs must only be served to authenticated users
  const user = await requireAuth(req, res)
  if (!user) return

  const { documentId } = req.query
  if (!documentId) {
    return res.status(400).json({ error: 'Missing documentId' })
  }

  try {
    const supabase = getServiceClient()

    // Fetch both file_path (new) and file_url (legacy) — handle either
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('file_path, file_url, file_name')
      .eq('id', documentId)
      .single()

    if (docError || (!doc?.file_path && !doc?.file_url)) {
      return res.status(404).json({ error: 'Document or file not found' })
    }

    // Resolve storage path — prefer file_path (new), fall back to extracting from file_url (legacy)
    let storagePath = doc.file_path || null
    if (!storagePath && doc.file_url) {
      // Legacy: extract path from stored signed URL
      // Format: .../storage/v1/object/sign/documents/PATH?token=...
      const pathMatch = doc.file_url.match(/\/documents\/([^?]+)/)
      if (pathMatch?.[1]) {
        storagePath = decodeURIComponent(pathMatch[1])
      } else {
        // URL is not a Supabase storage URL — return as-is (edge case)
        return res.status(200).json({ signedUrl: doc.file_url, fileName: doc.file_name })
      }
    }

    // S-02 FIX: Generate a fresh short-lived signed URL — 1 hour TTL
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

    if (error) {
      console.error('[get-document-url] createSignedUrl failed:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({
      signedUrl: data.signedUrl,
      fileName: doc.file_name,
    })

  } catch (err) {
    console.error('[get-document-url] Unexpected error:', err)
    return res.status(500).json({ error: err.message })
  }
}
