/**
 * components/ui/Skeletons.jsx — Shimmer loading placeholders
 *
 * Replaces blank loading screens with contextual skeleton UI
 * for perceived performance improvement.
 */

export function ProviderTableSkeleton({ rows = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-table-row">
          <div className="skeleton skeleton-avatar" style={{ borderRadius: 6 }} />
          <div>
            <div className="skeleton skeleton-text" style={{ width: '55%' }} />
            <div className="skeleton skeleton-text sm" style={{ width: '35%', marginBottom: 0 }} />
          </div>
          <div className="skeleton skeleton-text" style={{ width: '80%' }} />
          <div className="skeleton skeleton-badge" />
          <div className="skeleton skeleton-text" style={{ width: '70%' }} />
          <div className="skeleton skeleton-badge" />
        </div>
      ))}
    </div>
  )
}

export function KpiGridSkeleton() {
  return (
    <div className="kpi-grid" style={{ marginBottom: 20 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton skeleton-kpi" />
      ))}
    </div>
  )
}

export function CardBodySkeleton({ lines = 4 }) {
  return (
    <div style={{ padding: '12px 16px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton skeleton-text" style={{ width: `${70 + (i % 3) * 10}%` }} />
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="page">
      <KpiGridSkeleton />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="skeleton skeleton-card" style={{ height: 200 }} />
        <div className="skeleton skeleton-card" style={{ height: 200 }} />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 8 }) {
  return (
    <div className="tbl-wrap">
      <div style={{ padding: '10px 16px', background: 'var(--elevated)' }}>
        <div className="skeleton skeleton-text" style={{ width: '30%', height: 12 }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  )
}

/**
 * ApplicationsTableSkeleton — matches the Applications page table structure.
 * 9-column layout: checkbox, App ID, Provider, Payer, Status, Submitted,
 * Last Updated, Follow-up, Actions.
 */
export function ApplicationsTableSkeleton({ rows = 7 }) {
  const COL_WIDTHS = ['36px', '90px', '140px', '120px', '90px', '80px', '80px', '80px', '110px']
  return (
    <div className="tbl-wrap">
      <table style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            {COL_WIDTHS.map((_, i) => (
              <th key={i} style={{ padding: '10px 12px', background: 'var(--elevated)' }}>
                <div className="skeleton skeleton-text" style={{ width: i === 0 ? 16 : '70%', height: 11, marginBottom: 0 }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row} style={{ borderBottom: '1px solid var(--border-l)' }}>
              {/* Checkbox */}
              <td style={{ padding: '12px' }}>
                <div className="skeleton" style={{ width: 14, height: 14, borderRadius: 3, marginBottom: 0 }} />
              </td>
              {/* App ID */}
              <td style={{ padding: '12px 10px' }}>
                <div className="skeleton skeleton-text" style={{ width: '85%', height: 11, marginBottom: 0 }} />
              </td>
              {/* Provider */}
              <td style={{ padding: '12px 10px' }}>
                <div className="skeleton skeleton-text" style={{ width: '75%', height: 12, marginBottom: 4 }} />
                <div className="skeleton skeleton-text" style={{ width: '50%', height: 10, marginBottom: 0 }} />
              </td>
              {/* Payer */}
              <td style={{ padding: '12px 10px' }}>
                <div className="skeleton skeleton-text" style={{ width: '80%', height: 12, marginBottom: 0 }} />
              </td>
              {/* Status badge */}
              <td style={{ padding: '12px 10px' }}>
                <div className="skeleton" style={{ width: 72, height: 20, borderRadius: 99, marginBottom: 0 }} />
              </td>
              {/* Submitted */}
              <td style={{ padding: '12px 10px' }}>
                <div className="skeleton skeleton-text" style={{ width: '75%', height: 11, marginBottom: 0 }} />
              </td>
              {/* Last Updated */}
              <td style={{ padding: '12px 10px' }}>
                <div className="skeleton skeleton-text" style={{ width: '65%', height: 11, marginBottom: 0 }} />
              </td>
              {/* Follow-up */}
              <td style={{ padding: '12px 10px' }}>
                <div className="skeleton skeleton-text" style={{ width: '70%', height: 11, marginBottom: 0 }} />
              </td>
              {/* Actions */}
              <td style={{ padding: '12px 10px' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div className="skeleton" style={{ width: 58, height: 24, borderRadius: 'var(--r)', marginBottom: 0 }} />
                  <div className="skeleton" style={{ width: 32, height: 24, borderRadius: 'var(--r)', marginBottom: 0 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: '10px 16px', background: 'var(--elevated)', borderTop: '1px solid var(--border-l)' }}>
        <div className="skeleton skeleton-text" style={{ width: '20%', height: 11, marginBottom: 0 }} />
      </div>
    </div>
  )
}

/**
 * PageSkeleton — shown inside the app shell (sidebar + top bar already visible) while workspace data loads.
 * Mimics a typical page: title, a KPI strip, then a list. Announced once to screen readers.
 */
export function PageSkeleton() {
  return (
    <div className="page" role="status" aria-busy="true" aria-label="Loading your workspace">
      <div className="skeleton" style={{ width: 220, height: 26, marginBottom: 10 }} />
      <div className="skeleton skeleton-text sm" style={{ width: 340, maxWidth: '80%', marginBottom: 22 }} />
      <div className="skeleton" style={{ height: 78, borderRadius: 16, marginBottom: 18 }} />
      <TableSkeleton rows={6} />
    </div>
  )
}
