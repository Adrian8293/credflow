// pages/api/generate-opca.js
// POST { providerId, initials, formVersion }
// Returns filled OPCA PDF as binary download.
//
// Phase 1 (now): Returns provider validation status — no PDF yet.
// Phase 2: Wire in form-generator.js once coordinates are calibrated
//          against the real blank OPCA PDF stored in Supabase Storage.

import { createClient } from '@supabase/supabase-js'
import { providerFromDb } from '../../lib/mappers'
import { validateProviderForOPCA } from '../../lib/opca-validation-adapter'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { providerId, initials, formVersion = '2025' } = req.body

  if (!providerId) {
    return res.status(400).json({ error: 'providerId is required' })
  }

  try {
    // Fetch provider
    const { data, error } = await supabaseAdmin
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'Provider not found' })
    }

    const provider = providerFromDb(data)

    // Run validation gate
    const validation = validateProviderForOPCA(provider, formVersion)
    if (!validation.canExport) {
      return res.status(422).json({
        error: 'Export blocked',
        blockingIssues: validation.issues.filter(i => i.blocking && i.severity === 'error'),
      })
    }

    // ── Phase 2: PDF generation ──────────────────────────────────────────────
    // When ready, uncomment and wire in:
    //
    // const { generateFilledOPCA } = await import('../../lib/form-generator')
    //
    // 1. Fetch blank template from Supabase Storage:
    //    const { data: templateData } = await supabaseAdmin.storage
    //      .from('opca-templates')
    //      .download(`OPCA_${formVersion}_blank.pdf`)
    //    const templateBuffer = await templateData.arrayBuffer()
    //    const templateBase64 = Buffer.from(templateBuffer).toString('base64')
    //
    // 2. Generate filled PDF:
    //    const result = await generateFilledOPCA({
    //      templateBase64,
    //      provider,
    //      formVersion,
    //      initials: initials || (provider.fname[0] + provider.lname[0]),
    //    })
    //
    // 3. Return as download:
    //    res.setHeader('Content-Type', 'application/pdf')
    //    res.setHeader('Content-Disposition', `attachment; filename="OPCA_${formVersion}_${provider.lname}.pdf"`)
    //    return res.send(Buffer.from(result.pdfBytes))
    // ────────────────────────────────────────────────────────────────────────

    // Phase 1: return validation result only
    return res.status(200).json({
      status: 'validation_passed',
      provider: `${provider.fname} ${provider.lname}`,
      formVersion,
      message: 'Provider passed validation. PDF generation will be wired in Phase 2 after coordinate calibration.',
      validationSummary: {
        errors: validation.issues.filter(i => i.severity === 'error').length,
        warnings: validation.issues.filter(i => i.severity === 'warning').length,
      },
    })

  } catch (err) {
    console.error('[generate-opca]', err)
    return res.status(500).json({ error: 'Server error: ' + err.message })
  }
}
