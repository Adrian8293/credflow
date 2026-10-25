/**
 * lib/ics.js — builds a calendar file (.ics) of Lacentra's upcoming deadlines.
 * Import it into Google / Apple / Outlook calendar to get phone reminders without any email service.
 * All-day events, each with two reminders (9am the day before, and 9am the day of). Re-importing a newer file
 * updates the same events instead of duplicating them, because each event has a stable id.
 * Only names, deadline types and dates are included — no ID numbers.
 */
import { todayStr } from './matrix.js'
import { addDays } from './rosterDue.js'

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Folds a line to 75 bytes, as the format requires (never splitting a multi-byte character). */
export function fold(line) {
  const enc = new TextEncoder()
  let out = '', cur = '', bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > 75) { out += cur + '\r\n '; cur = ''; bytes = 1 }
    cur += ch; bytes += n
  }
  return out + cur
}

const compact = (iso) => iso.replace(/-/g, '')

function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** items: inbox-style entries with `days` (from today), `title`, `sub`, `type`. */
export function buildIcs(items, { today = todayStr(), now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lacentra//Deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Lacentra deadlines']
  let count = 0
  for (const it of items) {
    if (typeof it.days !== 'number' || it.days < 0) continue
    const date = addDays(today, it.days)
    const what = String(it.sub || '').split(' · ')[0]
    const uid = `${it.type}-${hash([it.type, it.provId, it.enrId, it.taskId, it.title, what, date].join('|'))}@lacentra`
    const next = addDays(date, 1)
    lines.push(
      'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(date)}`, `DTEND;VALUE=DATE:${compact(next)}`,
      `SUMMARY:${esc(`${it.title}${what ? ` — ${what}` : ''}`)}`,
      `DESCRIPTION:${esc(`${it.title}. ${it.sub || ''}`.trim())}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Deadline tomorrow', 'TRIGGER:-PT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Deadline today', 'TRIGGER:PT9H', 'END:VALARM',
      'END:VEVENT',
    )
    count++
  }
  lines.push('END:VCALENDAR')
  return { text: lines.map(fold).join('\r\n') + '\r\n', count }
}
