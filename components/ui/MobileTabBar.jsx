/**
 * Bottom tab bar for phones: the four places used all day, plus "More" for everything else.
 * Hidden on larger screens by CSS (.mtb only shows up to 900px wide).
 */
import { useRouter } from 'next/router'

const svg = (children) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const ICON = {
  today: svg(<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>),
  apps: svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></>),
  people: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
  tasks: svg(<><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>),
  more: svg(<><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></>),
}

export function MobileTabBar({ taskCount = 0, overdueCount = 0, menuOpen, onMore }) {
  const router = useRouter()
  const path = router.pathname
  const tabs = [
    { id: '/', label: 'Today', icon: ICON.today },
    { id: '/enrollments', label: 'Apps', icon: ICON.apps },
    { id: '/providers', label: 'People', icon: ICON.people },
    { id: '/tasks', label: 'Tasks', icon: ICON.tasks, badge: overdueCount || 0, soft: taskCount },
  ]
  return (
    <nav className="mtb" aria-label="Main">
      {tabs.map(t => (
        <button key={t.id} className={`mtb-item${path === t.id ? ' active' : ''}`} onClick={() => router.push(t.id)} aria-current={path === t.id ? 'page' : undefined}>
          <span className="mtb-ic">{t.icon}{t.badge > 0 && <span className="mtb-badge">{t.badge > 9 ? '9+' : t.badge}</span>}</span>
          <span className="mtb-lb">{t.label}</span>
        </button>
      ))}
      <button className={`mtb-item${menuOpen ? ' active' : ''}`} onClick={onMore} aria-expanded={!!menuOpen}>
        <span className="mtb-ic">{ICON.more}</span>
        <span className="mtb-lb">More</span>
      </button>
    </nav>
  )
}
