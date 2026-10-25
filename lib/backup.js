/**
 * lib/backup.js — a complete, readable backup of the workspace.
 * One CSV per table (opens in Excel), the same data as one JSON file (for restoring or moving), and a README.
 * Pure functions: the caller supplies the data, so this is easy to test.
 */
import { csvFromRows } from './csv.js'
import { todayStr } from './matrix.js'

const TABLES = [
  ['providers', 'Providers'], ['licenses', 'Extra state licenses'], ['payers', 'Payers'], ['enrollments', 'Applications'],
  ['documents', 'Document records (not the files themselves)'], ['tasks', 'Tasks'], ['requests', 'Document requests'],
  ['entities', 'Groups / legal entities'], ['contracts', 'Payer contracts'], ['contacts', 'Contact log'],
  ['checklist', 'Application checklists'], ['rosterMaps', 'Saved roster column maps'], ['auditLog', 'Audit log'],
]

const cell = (v) => (v && typeof v === 'object') ? JSON.stringify(v) : v

/** Array of objects -> CSV text (union of all keys, nested values as JSON). Empty -> header-less empty string. */
export function rowsToCsv(rows) {
  if (!rows || !rows.length) return ''
  const cols = []
  rows.forEach(r => Object.keys(r || {}).forEach(k => { if (!cols.includes(k)) cols.push(k) }))
  return csvFromRows([cols, ...rows.map(r => cols.map(c => cell(r?.[c])))])
}

/** data: { providers, payers, ... , settings } -> { files: {name: text}, counts: {table: n}, notes: [] } */
export function buildBackup(data, { date = todayStr() } = {}) {
  const files = {}, counts = {}, notes = []
  for (const [key, label] of TABLES) {
    const rows = Array.isArray(data[key]) ? data[key] : []
    counts[key] = rows.length
    files[`${key}.csv`] = '﻿' + rowsToCsv(rows)
  }
  files['settings.json'] = JSON.stringify(data.settings || {}, null, 2)
  files['lacentra-backup.json'] = JSON.stringify({ exportedOn: date, app: 'Lacentra', ...data }, null, 2)
  if (data.providersMeta?.truncated) notes.push(`Only ${counts.providers} of ${data.providersMeta.total} providers were loaded, so this backup is incomplete.`)
  files['README.txt'] = [
    `Lacentra backup — ${date}`, '',
    'What is inside',
    ...TABLES.map(([k, label]) => `  ${k}.csv — ${label} (${counts[k]} row${counts[k] === 1 ? '' : 's'})`),
    '  settings.json — practice settings', '  lacentra-backup.json — everything above in one file (use this to move or restore data)', '',
    'What is NOT inside',
    '  The uploaded document files (PDFs, images). Only their records are here. Download important files separately.',
    '  Passwords and sign-in details (these stay with Supabase).', '',
    'Keep it safe',
    '  This file contains license, DEA and NPI numbers. Store it somewhere private and delete old copies you no longer need.',
    ...(notes.length ? ['', 'WARNING', ...notes.map(n => '  ' + n)] : []),
  ].join('\r\n')
  return { files, counts, notes }
}
