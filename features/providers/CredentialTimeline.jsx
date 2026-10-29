/**
 * CredentialTimeline.jsx — Feature 8
 * Horizontal Gantt-style view showing credential expiry dates per provider across the year.
 */

import { daysUntil, fmtDate } from '../../lib/helpers.js'

const CRED_FIELDS = [
  { field: 'licenseExp', label: 'License',       color: '#3B82F6' },
  { field: 'malExp',     label: 'Malpractice',   color: '#8B5CF6' },
  { field: 'deaExp',     label: 'DEA',            color: '#F59E0B' },
  { field: 'caqhDue',   label: 'CAQH',           color: '#10B981' },
  { field: 'recred',    label: 'Recredentialing', color: '#EF4444' },
  { field: 'supExp',    label: 'Supervision',     color: '#EC4899' },
]

function getXPct(dateStr) {
  if (!dateStr) return null
  const now   = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const end   = new Date(now.getFullYear() + 1, 11, 31)
  const target = new Date(dateStr + 'T00:00:00')
  const pct = (target - start) / (end - start)
  return Math.min(Math.max(pct, 0), 1)
}

function getTodayPct() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const end   = new Date(now.getFullYear() + 1, 11, 31)
  return (now - start) / (end - start)
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function CredentialTimeline({ providers, onOpenProvider }) {
  const todayPct = getTodayPct()
  const year = new Date().getFullYear()

  if (!providers.length) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
        No providers to display.
      </div>
    )
  }

  // Only show providers with at least one credential date
  const provsWithDates = providers.filter(p =>
    CRED_FIELDS.some(c => p[c.field])
  )

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16, padding: '0 4px' }}>
        {CRED_FIELDS.map(c => (
          <div key={c.field} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{c.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 2, height: 14, background: 'var(--pr-solid)', borderRadius: 1 }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Today</span>
        </div>
      </div>

      {/* Gantt grid */}
      <div style={{ minWidth: 640, position: 'relative' }}>
        {/* Month header */}
        <div style={{ display: 'flex', marginBottom: 8, paddingLeft: 180 }}>
          {MONTHS.map((m, i) => (
            <div key={m} style={{ flex: 1, fontSize: 10.5, color: 'var(--text-4)', fontWeight: 600, textAlign: 'center', letterSpacing: '.02em' }}>
              {m}
            </div>
          ))}
        </div>

        {/* Provider rows */}
        {provsWithDates.map((p, pi) => {
          const events = CRED_FIELDS
            .filter(c => p[c.field])
            .map(c => {
              const xPct = getXPct(p[c.field])
              const days = daysUntil(p[c.field])
              return { ...c, xPct, days, date: p[c.field] }
            })
            .filter(e => e.xPct !== null)

          return (
            <div key={p.id || pi} style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 0 }}>
              {/* Provider name */}
              <div
                style={{ width: 180, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer', paddingRight: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onClick={() => onOpenProvider?.(p.id)}
                title={`${p.fname} ${p.lname}, ${p.cred}`}
              >
                {p.fname} {p.lname}
                <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 400 }}>{p.cred}</div>
              </div>

              {/* Timeline track */}
              <div style={{ flex: 1, position: 'relative', height: 36 }}>
                {/* Month grid lines */}
                {MONTHS.map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${(i / 12) * 100}%`, top: 0, bottom: 0,
                    width: 1, background: 'var(--border-l)',
                    zIndex: 0,
                  }} />
                ))}

                {/* Track background */}
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4, background: 'var(--elevated)', borderRadius: 2, transform: 'translateY(-50%)', border: '1px solid var(--border-l)' }} />

                {/* Today line */}
                <div style={{
                  position: 'absolute', left: `${todayPct * 100}%`, top: 0, bottom: 0,
                  width: 2, background: 'var(--pr-solid)', borderRadius: 1, zIndex: 2,
                  boxShadow: '0 0 4px rgba(21,101,192,.4)',
                }} />

                {/* Credential dots */}
                {events.map((ev, ei) => {
                  const isExpired  = ev.days < 0
                  const isCritical = !isExpired && ev.days <= 30
                  const isWarning  = !isExpired && ev.days > 30 && ev.days <= 90
                  const dotBorder  = isExpired ? '#EF4444' : isCritical ? '#F59E0B' : ev.color
                  return (
                    <div
                      key={ei}
                      title={`${ev.label}: ${fmtDate(ev.date)} (${isExpired ? `${Math.abs(ev.days)}d expired` : `${ev.days}d left`})`}
                      style={{
                        position: 'absolute',
                        left: `${ev.xPct * 100}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 14, height: 14,
                        borderRadius: '50%',
                        background: isExpired ? '#EF4444' : isCritical ? '#F59E0B' : ev.color,
                        border: `2px solid ${dotBorder}`,
                        boxShadow: isExpired || isCritical ? `0 0 0 3px ${dotBorder}33` : undefined,
                        cursor: 'default',
                        zIndex: 3,
                        transition: 'transform .15s',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}

        {provsWithDates.length === 0 && (
          <div style={{ paddingLeft: 180, fontSize: 13, color: 'var(--text-4)', padding: '20px 0 20px 180px' }}>
            No credential expiry dates found. Add dates to provider profiles to see them here.
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 12, paddingLeft: 4 }}>
        Showing {year}–{year + 1} · Hover dots for details · Click provider name to open profile
      </div>
    </div>
  )
}

export default CredentialTimeline
