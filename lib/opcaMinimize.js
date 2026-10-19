/**
 * opcaMinimize.js — credentialing-only OPCA storage.
 * An OPCA form carries personal details (home address, birth date, citizenship, gender, REALD demographics, SSN)
 * that credentialing does not need. They are removed from the extracted data BEFORE anything is saved, so they
 * never reach opca_profiles (columns or raw_extraction). Set OPCA_STORE_PERSONAL=true to keep the old behavior.
 */
export const PERSONAL_PRACTITIONER_KEYS = [
  'other_names', 'home_address', 'home_city', 'home_state', 'home_zip', 'home_phone', 'mobile_phone', 'home_email',
  'birth_date', 'birth_place', 'citizenship', 'gender', 'ssn', 'social_security_number',
  'reald_race', 'reald_ethnicity', 'reald_language', 'reald_primary_language', 'reald_disability',
]

export const storesPersonal = () => process.env.OPCA_STORE_PERSONAL === 'true'

export function minimizeExtraction(data) {
  if (!data || typeof data !== 'object' || storesPersonal()) return data
  const out = { ...data }
  if (out.practitioner_info && typeof out.practitioner_info === 'object') {
    const pi = { ...out.practitioner_info }
    PERSONAL_PRACTITIONER_KEYS.forEach(k => { delete pi[k] })
    out.practitioner_info = pi
  }
  if (out.practice_info && typeof out.practice_info === 'object') {
    const pr = { ...out.practice_info }
    ;['federal_tax_id', 'ein', 'tin'].forEach(k => { delete pr[k] })
    out.practice_info = pr
  }
  return out
}
