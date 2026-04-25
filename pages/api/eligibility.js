// pages/api/eligibility.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { memberId, dob, payerId, npi, dos } = req.body
  if (!memberId || !dob || !payerId || !npi) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // 1. Get OAuth token from Availity
    const tokenRes = await fetch('https://api.availity.com/availity/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AVAILITY_CLIENT_ID,
        client_secret: process.env.AVAILITY_CLIENT_SECRET,
        scope: 'hipaa'
      })
    })
    const { access_token } = await tokenRes.json()

    // 2. Submit eligibility inquiry (270/271 transaction)
    const eligRes = await fetch('https://api.availity.com/availity/v1/coverages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        controlNumber: Date.now().toString(),
        tradingPartnerId: payerId,
        provider: {
          organizationName: process.env.PRACTICE_NAME || 'Positive Inner Self',
          npi
        },
        subscriber: {
          memberId,
          dateOfBirth: dob,  // YYYY-MM-DD
          lastName: 'Unknown' // Availity allows '*' for wildcard
        },
        serviceTypeCodes: ['30'], // Health Benefit Plan Coverage
        serviceDate: dos || new Date().toISOString().split('T')[0]
      })
    })

    const data = await eligRes.json()
    
    // 3. Parse key benefit data from the 271 response
    const coverage = data.coverages?.[0]
    if (!coverage) return res.status(200).json({ status: 'Ineligible', raw: data })

    const benefits = coverage.benefitsInformation || []
    
    function findBenefit(codes) {
      return benefits.find(b => codes.includes(b.code))
    }

    // Code 30 = Health Benefit Plan Coverage, C = Copay, G = Deductible
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
    console.error('Availity error:', err)
    res.status(500).json({ error: err.message })
  }
}
