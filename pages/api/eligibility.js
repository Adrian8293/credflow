// pages/api/eligibility.js
import { requireAuth } from '../../lib/supabase-server'
import { enforceRateLimit, validateOrigin } from '../../lib/api-middleware'
import { getAvailityToken } from '../../lib/availity-token'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  // S-05 FIX: Validate request origin to prevent CSRF on state-mutating route
  if (!validateOrigin(req, res)) return
  if (!enforceRateLimit(req, res, { max: 20, windowMs: 60_000, keyPrefix: 'eligibility:' })) return

  const user = await requireAuth(req, res)
  if (!user) return

  // P-01 FIX: lastName was hardcoded as 'Unknown' — Availity treats this as a literal
  // last name filter, not a wildcard. This caused false-negative eligibility responses
  // (returning Ineligible for covered patients). lastName is now required.
  const { memberId, dob, payerId, npi, dos, lastName } = req.body
  if (!memberId || !dob || !payerId || !npi || !lastName) {
    return res.status(400).json({
      error: 'Missing required fields: memberId, dob, payerId, npi, and lastName are all required. ' +
             'Use "*" for lastName if the member last name is truly unknown (Availity wildcard).'
    })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)

  try {
    // P-02 FIX: Use cached token — previously fetched a fresh token on every request,
    // doubling API calls to Availity and risking token issuance rate limits under load.
    // getAvailityToken() caches the token in memory with a 60-second safety buffer.
    const access_token = await getAvailityToken(controller.signal)

    // Submit eligibility inquiry (270/271 transaction)
    const eligRes = await fetch('https://api.availity.com/availity/v1/coverages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        controlNumber: String(Date.now()).slice(-9),
        tradingPartnerId: payerId,
        provider: {
          organizationName: process.env.PRACTICE_NAME || 'Positive Inner Self',
          npi
        },
        subscriber: {
          memberId,
          dateOfBirth: dob,  // YYYY-MM-DD
          lastName,          // P-01 FIX: use actual lastName from request body
        },
        serviceTypeCodes: ['30'], // Health Benefit Plan Coverage
        serviceDate: dos || new Date().toISOString().split('T')[0]
      }),
      signal: controller.signal,
    })

    const data = await eligRes.json()

    // Parse key benefit data from the 271 response
    const coverage = data.coverages?.[0]
    if (!coverage) return res.status(200).json({ status: 'Ineligible', raw: data })

    const benefits = coverage.benefitsInformation || []

    function findBenefit(codes) {
      return benefits.find(b => codes.includes(b.code))
    }

    const copayBenefit = findBenefit(['B'])
    const deductBenefit = findBenefit(['C'])
    const oopBenefit    = findBenefit(['G'])

    const result = {
      status: 'Eligible',
      planName: coverage.planDescription || '',
      groupNum: coverage.groupOrPolicyNumber || '',
      covType: coverage.coverageLevelCode || '',
      copay: parseFloat(copayBenefit?.benefitAmount || 0),
      deductible: parseFloat(deductBenefit?.benefitAmount || 0),
      deductibleMet: parseFloat(benefits.find(b => b.code === 'C' && b.inPlanNetworkIndicatorCode === 'Y')?.benefitAmount || 0),
      oopMax: parseFloat(oopBenefit?.benefitAmount || 0),
      oopMet: 0,
      raw: data
    }

    res.status(200).json(result)
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Eligibility check timed out. Availity may be slow — please try again.' })
    }
    console.error('Availity error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    clearTimeout(timeout)
  }
}
