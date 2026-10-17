import { daysUntil } from './helpers.js'

/**
 * State-license helpers.
 * Model: providers.license / licenseExp / licenseState is the PRIMARY license; db.licenses holds additional ones.
 */
export function licensesFor(db, prov) {
  return (db.licenses || []).filter(l => l.provId === prov.id)
}

/** Every license state a provider holds a usable (not Inactive/Expired-by-date) license in. */
export function licensedStates(db, prov) {
  const out = new Set()
  if (prov.licenseState && (prov.license || prov.licenseExp)) {
    if (daysUntil(prov.licenseExp) === null || daysUntil(prov.licenseExp) >= 0) out.add(prov.licenseState)
  }
  licensesFor(db, prov).forEach(l => {
    if (l.status === 'Inactive') return
    const d = daysUntil(l.expires)
    if (d === null || d >= 0) out.add(l.state)
  })
  return out
}

/** All licenses of a provider as one list, primary first. */
export function allLicenses(db, prov) {
  const rows = []
  if (prov.license || prov.licenseExp) {
    rows.push({ id: null, primary: true, state: prov.licenseState || '', licenseType: '', number: prov.license, expires: prov.licenseExp, status: 'Active' })
  }
  licensesFor(db, prov).forEach(l => rows.push({ ...l, primary: false }))
  return rows
}

/**
 * Enrollments in a state where the provider holds no current license (or whose only license there expired).
 * Skips providers with no license data at all (that gap is flagged elsewhere) and enrollments with no state.
 * Returns [{ prov, state, enrollments: [...] }] grouped by provider + state.
 */
export function licenseGaps(db) {
  const gaps = []
  ;(db.providers || []).forEach(prov => {
    const held = licensedStates(db, prov)
    const everLicensed = (prov.license || prov.licenseExp) || licensesFor(db, prov).length > 0
    if (!everLicensed) return
    const byState = {}
    ;(db.enrollments || []).forEach(e => {
      if (e.provId !== prov.id || !e.state || e.state === 'Other') return
      if (['Denied', 'Rejected', 'Terminated'].includes(e.stage)) return
      if (e.termDate && daysUntil(e.termDate) !== null && daysUntil(e.termDate) < 0) return
      if (held.has(e.state)) return
      ;(byState[e.state] = byState[e.state] || []).push(e)
    })
    Object.entries(byState).forEach(([state, enrollments]) => gaps.push({ prov, state, enrollments }))
  })
  return gaps
}
