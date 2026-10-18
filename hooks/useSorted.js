import { usePersistedState } from './usePersistedState.js'

// persistKey (optional): remember the chosen sort in this browser, e.g. 'lc_pref_apps_sort'.
function useSorted(items, defaultKey, defaultDir='asc', persistKey) {
  const [sortKey, setSortKey] = usePersistedState(persistKey ? persistKey + '_key' : null, defaultKey, v => typeof v === 'string')
  const [sortDir, setSortDir] = usePersistedState(persistKey ? persistKey + '_dir' : null, defaultDir, v => v === 'asc' || v === 'desc')
  function toggleSort(key) {
    if (sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sorted = [...(items||[])].sort((a,b)=>{
    const av=a[sortKey]??'', bv=b[sortKey]??''
    const cmp = typeof av==='number'&&typeof bv==='number' ? av-bv : String(av).localeCompare(String(bv),undefined,{numeric:true})
    return sortDir==='asc'?cmp:-cmp
  })
  function thProps(key, label, noSort=false) {
    if(noSort) return {className:'no-sort',children:label}
    return {onClick:()=>toggleSort(key),className:sortKey===key?('sort-'+sortDir):'',children:label,style:{cursor:'pointer'}}
  }
  return {sorted,sortKey,sortDir,toggleSort,thProps}
}

export { useSorted }
