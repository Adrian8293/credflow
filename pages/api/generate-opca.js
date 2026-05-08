// pages/api/generate-opca.js
// POST { profileId, initials }
// Fetches profile from opca_profiles, fills the real 2025 OPCA PDF, returns download.

import { requireAuth, supabaseAdmin } from '../../lib/supabase-server'
import { fillOpcaPdf } from '../../lib/opca-pdf-filler'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireAuth(req, res)
  if (!user) return

  // ssn is accepted here but NEVER written to the database.
  // It flows directly into the PDF fill function and is discarded after.
  // The caller (frontend) must prompt the provider for their SSN at download
  // time — it is not stored anywhere in the system (C-3).
  const { profileId, initials, ssn } = req.body

  if (!profileId) {
    return res.status(400).json({ error: 'profileId is required' })
  }

  // Fetch the OPCA profile
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('opca_profiles')
    .select('*')
    .eq('id', profileId)
    .single()

  if (profileError || !profile) {
    return res.status(404).json({ error: 'OPCA profile not found' })
  }

  // Fetch blank 2025 template from Supabase Storage
  const { data: templateBlob, error: storageError } = await supabaseAdmin
    .storage
    .from('opca-templates')
    .download('OPCA_2025_blank.pdf')

  if (storageError || !templateBlob) {
    return res.status(500).json({
      error: 'Blank OPCA template not found. Upload OPCA_2025_blank.pdf to the opca-templates bucket in Supabase Storage.',
    })
  }

  const templateBuffer = Buffer.from(await templateBlob.arrayBuffer())

  try {
    const derivedInitials = initials ||
      ((profile.first_name?.[0] || '') + (profile.last_name?.[0] || '')).toUpperCase()

    // Merge ssn into profile in-memory only — never persisted
    const profileWithSsn = ssn ? { ...profile, ssn } : profile

    const pdfBuffer = await fillOpcaPdf({
      templateBuffer,
      profile: profileWithSsn,
      initials: derivedInitials,
    })

    // Sanitize filename — profile data comes from AI extraction and is untrusted
    const safeName = (profile.last_name || 'Provider')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50)
    const filename = `OPCA_2025_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.send(pdfBuffer)

  } catch (err) {
    console.error('[generate-opca] PDF fill error:', err)
    return res.status(500).json({ error: 'PDF generation failed: ' + err.message })
  }
}
