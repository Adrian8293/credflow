/**
 * components/ui/Pagination.jsx — Reusable pagination controls
 *
 * Usage:
 *   <Pagination
 *     page={page}
 *     totalPages={totalPages}
 *     totalItems={totalItems}
 *     onPageChange={setPage}
 *     onNext={nextPage}
 *     onPrev={prevPage}
 *   />
 */
export function Pagination({ page, totalPages, totalItems, onPageChange, onNext, onPrev, pageSize = 25 }) {
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  // Generate page numbers with ellipsis
  function getPageNumbers() {
    const pages = []
    const delta = 1 // pages around current

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= page - delta && i <= page + delta)
      ) {
        pages.push(i)
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...')
      }
    }
    return pages
  }

  return (
    <div className="pagination-bar">
      <span className="pagination-info">
        {start}–{end} of {totalItems}
      </span>
      <div className="pagination-controls">
        <button
          className="pagination-btn"
          onClick={onPrev}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          ←
        </button>
        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`pagination-btn ${p === page ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}
        <button
          className="pagination-btn"
          onClick={onNext}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  )
}
