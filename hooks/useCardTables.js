import { useEffect } from 'react'

/**
 * Phone mode: on screens up to 900px wide, every data table is shown as a stack of cards
 * (title line, then "label  value" rows, actions at the bottom) instead of a wide scrolling grid.
 * This only adds labels and classes to the existing table markup; CSS does the layout.
 * Skip a table by putting data-no-cards on it or any parent (the Billing Matrix does).
 */
const isBlank = (t) => t === '' || t === '…' || t === '...' || t === '—' || t === '-' || t === '–'

function cardify(table) {
  if (table.closest('[data-no-cards]') || /(^|\s)pt-/.test(table.className)) return
  const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim())
  if (!heads.length) return
  table.classList.add('cards')
  table.querySelectorAll('tbody > tr').forEach(tr => {
    let titleSet = false
    ;[...tr.children].forEach((td, i) => {
      if (td.tagName !== 'TD') return
      const label = /^[\W_]*$/.test(heads[i] || '') ? '' : heads[i]
      const text = td.textContent.trim()
      const interactive = !!td.querySelector('button, input, select, a')
      const isCheck = !!td.querySelector('input[type="checkbox"]') && !text
      const isActions = !isCheck && (/^actions?$/i.test(label) || (label === '' && interactive && !titleSet))
      let role = ''
      if (isCheck) role = 'check'
      else if (isActions) role = 'actions'
      else if (!titleSet) { role = 'title'; titleSet = true }
      if (td.dataset.label !== label) td.dataset.label = label
      if ((td.dataset.role || '') !== role) { if (role) td.dataset.role = role; else delete td.dataset.role }
      const empty = !interactive && (isBlank(text) || (!role && !label))
      if (empty) { if (td.dataset.empty !== '1') td.dataset.empty = '1' } else if (td.dataset.empty) delete td.dataset.empty
    })
  })
}

export function useCardTables() {
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    let raf = 0
    const run = () => { raf = 0; document.querySelectorAll('table').forEach(cardify) }
    const schedule = () => { if (mq.matches && !raf) raf = requestAnimationFrame(run) }
    const obs = new MutationObserver(schedule)
    obs.observe(document.body, { childList: true, subtree: true })
    mq.addEventListener?.('change', schedule)
    schedule()
    return () => { obs.disconnect(); mq.removeEventListener?.('change', schedule); if (raf) cancelAnimationFrame(raf) }
  }, [])
}
