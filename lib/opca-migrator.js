// lib/opca-migrator.js
// Migrates an opca_profiles record from form version 2023 or 2024 → 2025.
// Returns: { migratedProfile, newFields, changedFields, warnings }

/**
 * Fields added in 2025 vs 2024/2023 OPCA
 * These will be flagged as "new — needs provider input" if missing
 */
const NEW_IN_2025 = [
  { field: 'reald_race',       label: 'REALD — Race',              section: 'II', required: false },
  { field: 'reald_ethnicity',  label: 'REALD — Ethnicity',         section: 'II', required: false },
  { field: 'reald_language',   label: 'REALD — Primary Language',  section: 'II', required: false },
  { field: 'reald_disability', label: 'REALD — Current Disabilities', section: 'II', required: false },
  { field: 'dea_issue_date',   label: 'DEA Issue Date',            section: 'XIV', required: false },
  { field: 'csr_issue_date',   label: 'CSR Issue Date',            section: 'XIV', required: false },
]

/**
 * Fields that changed label/format between versions
 * (Same data, different form layout — auto-migrated)
 */
const FIELD_RENAMES = {
  // No field renames between 2023–2025 that require data transformation
}

/**
 * Migrate an opca_profiles row to 2025.
 * @param {Object} sourceProfile - Row from opca_profiles table
 * @returns {{ migratedProfile, newFields, warnings }}
 */
export function migrateToOpca2025(sourceProfile) {
  const sourceVersion = sourceProfile.form_version || '2024'

  if (sourceVersion === '2025') {
    return {
      migratedProfile: { ...sourceProfile },
      newFields: [],
      warnings: [],
    }
  }

  // Deep copy
  const migrated = { ...sourceProfile }

  // Update metadata
  migrated.form_version = '2025'
  migrated.source = 'migrated'
  migrated.migrated_from = sourceProfile.id
  delete migrated.id         // new record
  delete migrated.created_at
  delete migrated.updated_at

  // Track which new 2025 fields are missing
  const newFields = []
  const warnings = []

  for (const { field, label, section, required } of NEW_IN_2025) {
    const hasValue = migrated[field] !== null && migrated[field] !== undefined && migrated[field] !== ''
    newFields.push({
      field,
      label,
      section,
      required,
      hasValue,
      value: migrated[field] || null,
    })
    if (!hasValue && required) {
      warnings.push({
        severity: 'error',
        section,
        field,
        message: `${label} is required in 2025 form but was not in the ${sourceVersion} version.`,
      })
    }
  }

  // Parse JSONB fields that might be strings
  const jsonbFields = [
    'board_certs', 'other_certs', 'secondary_practices', 'call_coverage',
    'professional_schools', 'internship', 'residencies', 'fellowships',
    'other_licenses', 'current_affiliations', 'pending_applications',
    'previous_affiliations', 'work_history', 'work_history_gaps',
    'peer_references', 'cme_activities', 'current_malpractice',
    'prior_malpractice', 'attestation', 'raw_extraction',
  ]
  for (const field of jsonbFields) {
    if (typeof migrated[field] === 'string') {
      try { migrated[field] = JSON.parse(migrated[field]) } catch {}
    }
  }

  // Validate work history gaps (> 2 months must be explained — 2025 requires this)
  const workHistory = Array.isArray(migrated.work_history) ? migrated.work_history : []
  if (workHistory.length > 0) {
    const sortedJobs = [...workHistory].sort((a, b) => {
      const dateA = a.from_date ? new Date(a.from_date) : new Date(0)
      const dateB = b.from_date ? new Date(b.from_date) : new Date(0)
      return dateA - dateB
    })
    for (let i = 0; i < sortedJobs.length - 1; i++) {
      const end = sortedJobs[i].to_date ? new Date(sortedJobs[i].to_date) : null
      const start = sortedJobs[i + 1].from_date ? new Date(sortedJobs[i + 1].from_date) : null
      if (end && start) {
        const gapMonths = (start.getFullYear() - end.getFullYear()) * 12 + (start.getMonth() - end.getMonth())
        if (gapMonths > 2) {
          const gaps = Array.isArray(migrated.work_history_gaps) ? migrated.work_history_gaps : []
          const alreadyExplained = gaps.some(g => g.from_date === sortedJobs[i].to_date)
          if (!alreadyExplained) {
            warnings.push({
              severity: 'warning',
              section: 'XVII',
              field: 'work_history_gaps',
              message: `Gap of ~${gapMonths} months detected between "${sortedJobs[i].employer}" (ended ${sortedJobs[i].to_date}) and "${sortedJobs[i + 1].employer}" (started ${sortedJobs[i + 1].from_date}). Section XVII-B requires explanation.`,
            })
          }
        }
      }
    }
  }

  // Validate peer references count (2025 requires 3)
  const refs = Array.isArray(migrated.peer_references) ? migrated.peer_references : []
  if (refs.length < 3) {
    warnings.push({
      severity: 'warning',
      section: 'XVIII',
      field: 'peer_references',
      message: `Only ${refs.length} peer reference(s) found. 2025 OPCA requires 3.`,
    })
  }

  // Validate professional liability insurance
  const currentMal = typeof migrated.current_malpractice === 'object'
    ? migrated.current_malpractice
    : {}
  if (!currentMal.carrier) {
    warnings.push({
      severity: 'error',
      section: 'XX',
      field: 'current_malpractice',
      message: 'Current professional liability insurance carrier is missing.',
    })
  }

  return { migratedProfile: migrated, newFields, warnings }
}

/**
 * Save a migrated profile to opca_profiles and return the new record ID.
 * Call from an API route after running migrateToOpca2025().
 */
export function buildMigrationSummary(sourceProfile, result) {
  const { newFields, warnings } = result
  return {
    sourceVersion: sourceProfile.form_version,
    targetVersion: '2025',
    provider: `${sourceProfile.first_name || ''} ${sourceProfile.last_name || ''}`.trim(),
    newFieldsCount: newFields.length,
    newFieldsWithValues: newFields.filter(f => f.hasValue).length,
    newFieldsMissing: newFields.filter(f => !f.hasValue),
    errorCount: warnings.filter(w => w.severity === 'error').length,
    warningCount: warnings.filter(w => w.severity === 'warning').length,
    warnings,
    readyToExport: warnings.filter(w => w.severity === 'error').length === 0,
  }
}
