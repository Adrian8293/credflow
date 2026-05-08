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
