import { requireAuth } from '../../lib/supabase-server'

function formatPhone(raw = '') {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return raw
}

export default async function handler(req, res) {
  // Auth guard — prevent open proxy abuse
  const user = await requireAuth(req, res)
  if (!user) return


  const { number, first_name, last_name, organization_name, state, taxonomy, city, zip, npi_type = 'NPI-1', limit = 25 } = req.query

  if (!number && !first_name && !last_name && !organization_name) {
    return res.status(400).json({ error: 'Enter an NPI number, a name, or an organization name.' })
  }

  try {
    const params = new URLSearchParams({ version: '2.1', limit })
    if (number) {
      params.append('number', number)
    } else if (npi_type === 'NPI-2') {
      if (organization_name) params.append('organization_name', organization_name + '*')
      params.append('enumeration_type', 'NPI-2')
    } else {
      if (first_name) params.append('first_name', first_name + '*')
      if (last_name)  params.append('last_name',  last_name  + '*')
      params.append('enumeration_type', 'NPI-1')
    }
    if (state)    params.append('state', state)
    if (city)     params.append('city', city)
    if (zip)      params.append('postal_code', zip)
    if (taxonomy) params.append('taxonomy_description', taxonomy + '*')

    const url = `https://npiregistry.cms.hhs.gov/api/?${params.toString()}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CredFlow/1.0 (Positive Inner Self, LLC)' }
    })

    if (!response.ok) {
      return res.status(502).json({ error: 'NPPES registry returned an error.' })
    }

    const data = await response.json()

    const results = (data.results || []).map(r => {
      const basic  = r.basic || {}
      const addrs  = r.addresses || []
      const locAddr = addrs.find(a => a.address_purpose === 'LOCATION') || {}
      const mailAddr = addrs.find(a => a.address_purpose === 'MAILING') || {}
      const taxes  = r.taxonomies || []
      const primaryTax = taxes.find(t => t.primary) || taxes[0] || {}
      const ids    = r.identifiers || []
      const otherNames = r.other_names || []

      return {
        // Core
        npi:            r.number || '',
        enumType:       r.enumeration_type || '',
        npiStatus:      basic.status === 'A' ? 'Active' : basic.status === 'D' ? 'Deactivated' : (basic.status || ''),

        // Name
        fname:          basic.first_name   || '',
        lname:          basic.last_name    || '',
        mname:          basic.middle_name  || '',
        suffix:         basic.name_suffix  || '',
        credential:     (basic.credential  || '').replace(/\./g, '').trim(),
        gender:         basic.gender       || '',
        soloProprietor: basic.sole_proprietor || '',

        // Org (NPI-2)
        orgName:        basic.organization_name || '',
        orgSubpart:     basic.organizational_subpart || '',

        // Dates
        enumerationDate:   basic.enumeration_date    || '',
        lastUpdated:       basic.last_updated         || '',
        certificationDate: basic.certification_date  || '',

        // Primary taxonomy
        taxonomyCode:   primaryTax.code    || '',
        taxonomyDesc:   primaryTax.desc    || '',
        taxonomyState:  primaryTax.state   || '',
        taxonomyLicense:primaryTax.license || '',
        taxonomyPrimary:primaryTax.primary || false,

        // All taxonomies
        allTaxonomies: taxes.map(t => ({
          code:    t.code    || '',
          desc:    t.desc    || '',
          state:   t.state   || '',
          license: t.license || '',
          primary: t.primary || false,
        })),

        // Practice location address
        address1:  locAddr.address_1    || '',
        address2:  locAddr.address_2    || '',
        city:      locAddr.city         || '',
        state:     locAddr.state        || '',
        zip:       locAddr.postal_code  || '',
        country:   locAddr.country_name || '',
        phone:     formatPhone(locAddr.telephone_number || ''),
        fax:       formatPhone(locAddr.fax_number       || ''),
        // Full formatted strings
        address:   [locAddr.address_1, locAddr.address_2].filter(Boolean).join(', '),
        cityStateZip: [locAddr.city, locAddr.state, locAddr.postal_code].filter(Boolean).join(', '),

        // Mailing address
        mailAddress1:   mailAddr.address_1   || '',
        mailAddress2:   mailAddr.address_2   || '',
        mailCity:       mailAddr.city        || '',
        mailState:      mailAddr.state       || '',
        mailZip:        mailAddr.postal_code || '',
        mailPhone:      formatPhone(mailAddr.telephone_number || ''),

        // All addresses (for display)
        allAddresses: addrs.map(a => ({
          purpose: a.address_purpose || '',
          address1: a.address_1 || '',
          address2: a.address_2 || '',
          city:    a.city || '',
          state:   a.state || '',
          zip:     a.postal_code || '',
          country: a.country_name || '',
          phone:   formatPhone(a.telephone_number || ''),
          fax:     formatPhone(a.fax_number || ''),
        })),

        // Other identifiers (state licenses, Medicaid, etc.)
        identifiers: ids.map(i => ({
          code:       i.code       || '',
          desc:       i.desc       || '',
          identifier: i.identifier || '',
          state:      i.state      || '',
          issuer:     i.issuer     || '',
        })),

        // Other names / former names
        otherNames: otherNames.map(n => ({
          type:  n.type       || '',
          code:  n.code       || '',
          fname: n.first_name || '',
          lname: n.last_name  || '',
        })),
      }
    })

    return res.status(200).json({ results, resultCount: data.result_count || results.length })
  } catch (err) {
    console.error('NPI search error:', err)
    return res.status(500).json({ error: 'Could not reach NPI registry. Try again.' })
  }
}
