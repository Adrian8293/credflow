import { useState, useCallback, useMemo } from 'react'

/**
 * usePagination — Client-side pagination for lists.
 *
 * Usage:
 *   const { page, pageSize, paginated, totalPages, setPage, nextPage, prevPage }
 *     = usePagination(items, { pageSize: 25 })
 *
 * For server-side (cursor) pagination, use the db.js fetch functions
 * with .range() directly.
 */
function usePagination(items, { pageSize = 25 } = {}) {
  const [page, setPage] = useState(1)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((items?.length || 0) / pageSize)),
    [items?.length, pageSize]
  )

  // Clamp page to valid range when items change
  const safePage = Math.min(page, totalPages)

  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return (items || []).slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  const nextPage = useCallback(() => {
    setPage(p => Math.min(p + 1, totalPages))
  }, [totalPages])

  const prevPage = useCallback(() => {
    setPage(p => Math.max(p - 1, 1))
  }, [])

  const goToPage = useCallback((n) => {
    setPage(Math.max(1, Math.min(n, totalPages)))
  }, [totalPages])

  return {
    page: safePage,
    pageSize,
    paginated,
    totalPages,
    totalItems: items?.length || 0,
    setPage: goToPage,
    nextPage,
    prevPage,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  }
}

export { usePagination }
