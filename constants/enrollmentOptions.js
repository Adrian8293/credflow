// Shared option lists for enrollment + payer forms. Associate modes come from documented payer policies
// (Moda RPM079, PacificSource, Kaiser WA, HCA, OHA, CMS); "Unverified" is the honest default until confirmed in writing.
export const ENROLLMENT_MODELS = ['Individual + Group', 'Individual only', 'Group only']
export const PRODUCT_LINES = ['Commercial', 'Medicaid', 'Medicare', 'Medicare Advantage', 'Exchange', 'Other']
export const STATES = ['OR', 'WA', 'CA', 'ID', 'AK', 'Other']
export const ASSOCIATE_MODES = [
  'Unverified',
  'Roster under group',
  'Supervisor bills',
  'Incident-to with modifier',
  'Own enrollment under agency/supervisor',
  'Not allowed',
]
