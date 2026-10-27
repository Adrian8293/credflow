import { usePersistedState } from './usePersistedState.js'

// persistKey (optional): remember the chosen sort in this browser, e.g. 'lc_pref_apps_sort'.
function useSorted(items, defaultKey, defaultDir='asc', persistKey) {
  const [sortKey, setSortKey] = usePersistedState(persistKey ? persistKey + '_key' : null, defaultKey, v => typeof v === 'string')
  const [sortDir, setSortDir] = usePersistedState(persistKey ? persistKey + '_dir' : null, defaultDir, v => v === 'asc' || v === 'desc')
  function toggleSort(key) {
    if (sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const isEmpty = v => v === undefined || v === null || v === ''
  const sorted = [...(items||[])].sort((a,b)=>{
    const av=a[sortKey]??'', bv=b[sortKey]??''
    // Blank values (e.g. a date nobody has entered) always sort last, whichever way the column is ordered.
    if (isEmpty(av) || isEmpty(bv)) return isEmpty(av) === isEmpty(bv) ? 0 : isEmpty(av) ? 1 : -1
    const cmp = typeof av==='number'&&typeof bv==='number' ? av-bv : String(av).localeCompare(String(bv),undefined,{numeric:true})
    return sortDir==='asc'?cmp:-cmp
  })
  function thProps(key, label, noSort=false) {
    if(noSort) return {className:'no-sort',children:label}
    const active = sortKey===key
    return {
      onClick:()=>toggleSort(key),
      // Keyboard + screen-reader operable: the header is reachable with Tab, Enter/Space sorts, aria-sort says which way.
      tabIndex:0,
      onKeyDown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleSort(key) } },
      'aria-sort':active?(sortDir==='asc'?'ascending':'descending'):'none',
      className:active?('sort-'+sortDir):'',children:label,style:{cursor:'pointer'},
    }
  }
  return {sorted,sortKey,sortDir,toggleSort,thProps}
}

export { useSorted }
