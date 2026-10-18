/**
 * dataQuality.js — finds missing / inconsistent data that makes alerts and reports wrong.
 * Pure function: returns a flat list of issues. sev 'high' = hides a risk (no expiry tracking, bad NPI);
 * sev 'med' = weakens reporting. Inactive providers and Denied applications are skipped.
 */
import { validNpi } from './providerImport.js'
import { pNameShort, payName } from './helpers.js'

export function dataQualityIssues(db) {
  const out = []
  const add = (scope, refId, who, issue, sev = 'med') => out.push({ key: `${scope}:${refId}:${issue}`, scope, refId, who, issue, sev })

  const live = db.providers.filter(p => p.status !== 'Inactive')
  const npiCount = {}
  live.forEach(p => { if (p.npi) npiCount[p.npi] = (npiCount[p.npi] || 0) + 1 })

  live.forEach(p => {
    const who = `${p.fname} ${p.lname}${p.cred ? `, ${p.cred}` : ''}`.trim()
    if (!p.npi) add('provider', p.id, who, 'No NPI on file', 'high')
    else if (!validNpi(String(p.npi))) add('provider', p.id, who, 'NPI is not valid (check the digits)', 'high')
    else if (npiCount[p.npi] > 1) add('provider', p.id, who, 'Same NPI as another provider', 'high')

    if (!p.license && !p.licenseExp) add('provider', p.id, who, 'No license on file', 'high')
    else if (!p.licenseExp) add('provider', p.id, who, 'License has no expiration date — it cannot be tracked', 'high')
    else if (!p.license) add('provider', p.id, who, 'License expiration set but no license number')

    if (!p.malExp) add('provider', p.id, who, p.malPolicy || p.malCarrier ? 'Malpractice has no expiration date — it cannot be tracked' : 'No malpractice insurance on file', 'high')
    if (p.caqh && !p.caqhDue) add('provider', p.id, who, 'CAQH ID but no re-attestation due date')
    if (p.dea && !p.deaExp) add('provider', p.id, who, 'DEA number but no expiration date', 'high')
    if (p.supervisor && !p.supExp) add('provider', p.id, who, 'Supervisor named but no supervision agreement expiration')
  })

  const provById = new Map(db.providers.map(p => [p.id, p]))
  db.enrollments.forEach(e => {
    const stage = e.stage || 'Not Started'
    if (stage === 'Denied') return
    if (provById.get(e.provId)?.status === 'Inactive') return
    const who = `${pNameShort(db.providers, e.provId)} · ${payName(db.payers, e.payId)}`
    const eff = e.effective || e.credentialingEffective
    if (stage !== 'Not Started' && !e.submitted) add('enrollment', e.id, who, 'No Submitted date', 'med')
    if (stage === 'Active' && !eff) add('enrollment', e.id, who, 'Active but no Effective date', 'high')
    if (e.submitted && eff && eff < e.submitted) add('enrollment', e.id, who, 'Effective date is before the Submitted date', 'high')
    if (!['Active', 'Not Started'].includes(stage) && !e.followup) add('enrollment', e.id, who, 'In progress with no follow-up date')
    if (e.level === 'Group' && !e.groupName) add('enrollment', e.id, who, 'Group enrollment without a group name')
  })

  const order = { high: 0, med: 1 }
  return out.sort((a, b) => order[a.sev] - order[b.sev] || a.who.localeCompare(b.who))
}
