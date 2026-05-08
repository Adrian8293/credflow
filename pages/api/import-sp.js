// pages/api/import-sp.js
import { requireAuth, supabaseAdmin } from '../../lib/supabase-server'
import { enforceRateLimit } from '../../lib/api-middleware'

// SimplePractice CSV column → your schema field mapping
const SP_CLAIM_MAP = {
  'Client Name':        'patient_name',
  'Date of Birth':      'dob',
  'Date of Service':    'dos',
  'CPT Code':           'cpt_codes',         // wrap in array
  'Diagnosis Code':     'diagnosis_codes',    // wrap in array
  'Clinician Name':     '_provider_name',     // resolve to prov_id
  'Insurance':          '_payer_name',        // resolve to payer_id
  'Amount Billed':      'billed_amount',
  'Amount Paid':        'paid_amount',
  'Patient Paid':       'patient_resp',
  'Claim Status':       'status',
  'Claim Number':       'claim_num',
  'Date Submitted':     'submitted_date',
  'Date Paid':          'paid_date',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!enforceRateLimit(req, res, { max: 8, windowMs: 60_000, keyPrefix: 'import-sp:' })) return

  const user = await requireAuth(req, res)
  if (!user) return

  const { rows } = req.body  // Parsed CSV rows from the frontend

  // Fetch lookup tables once
  const [{ data: providers }, { data: payers }] = await Promise.all([
    supabaseAdmin.from('providers').select('id, fname, lname'),
    supabaseAdmin.from('payers').select('id, name')
  ])

  const claims = rows.map(row => {
    const claim = {}
    for (const [csvCol, field] of Object.entries(SP_CLAIM_MAP)) {
      const val = row[csvCol]?.trim()
      if (!val) continue

      if (field === 'cpt_codes' || field === 'diagnosis_codes') {
        claim[field] = [val]
      } else if (field === '_provider_name') {
        const [last, first] = val.split(',').map(s => s.trim())
        const p = providers?.find(x =>
          x.lname?.toLowerCase() === last?.toLowerCase() &&
          x.fname?.toLowerCase() === first?.toLowerCase()
        )
        claim.prov_id = p?.id || null
      } else if (field === '_payer_name') {
        const p = payers?.find(x =>
          x.name?.toLowerCase().includes(val.toLowerCase()) ||
          val.toLowerCase().includes(x.name?.toLowerCase())
        )
        claim.payer_id = p?.id || null
      } else if (['billed_amount','paid_amount','patient_resp','allowed_amount'].includes(field)) {
        claim[field] = parseFloat(val.replace(/[$,]/g, '')) || 0
      } else {
        claim[field] = val
      }
    }
    return claim
  }).filter(c => c.patient_name && c.dos)

  const { data, error } = await supabaseAdmin
    .from('claims')
    .upsert(claims, { onConflict: 'claim_num', ignoreDuplicates: false })
    .select()

  if (error) return res.status(500).json({ error: error.message })
  res.status(200).json({ imported: data.length, skipped: rows.length - data.length })
}
