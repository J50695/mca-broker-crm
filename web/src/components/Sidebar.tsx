import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

type NavItem = {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

const navItems: NavItem[] = [
  {
    to: '/',
    label: 'Pipeline',
    end: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3A1.5 1.5 0 0 1 8 4.5v11A1.5 1.5 0 0 1 6.5 17h-3A1.5 1.5 0 0 1 2 15.5v-11Zm7.5 0A1.5 1.5 0 0 1 11 3h3A1.5 1.5 0 0 1 15.5 4.5v5A1.5 1.5 0 0 1 14 11h-3a1.5 1.5 0 0 1-1.5-1.5v-5Zm0 8A1.5 1.5 0 0 1 11 12h3a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 14 18h-3a1.5 1.5 0 0 1-1.5-1.5v-3Z" />
      </svg>
    ),
  },
  {
    to: '/submissions',
    label: 'Submissions',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path fillRule="evenodd" d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Zm7.25 2.25a.75.75 0 0 0-1.5 0v4.69l-1.72-1.72a.75.75 0 0 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.75.75 0 1 0-1.06-1.06l-1.72 1.72V5.75Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    to: '/lenders',
    label: 'Lenders',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path fillRule="evenodd" d="M10 2a4 4 0 0 0-4 4v1H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm-2 5V6a2 2 0 1 1 4 0v1H8Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    to: '/intake',
    label: 'Intake',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M9.25 2A2.25 2.25 0 0 0 7 4.25v.75H5.5A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 14.5 6H13v-.75A2.25 2.25 0 0 0 10.75 2h-1.5ZM8.5 4.25a1.25 1.25 0 0 1 1.25-1.25h1.5a1.25 1.25 0 0 1 1.25 1.25V6h-4v-.75Z" />
        <path d="M10 9.25a.75.75 0 0 1 .75.75v2.19l.72-.72a.75.75 0 1 1 1.06 1.06l-2 2a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l.72.72v-2.19A.75.75 0 0 1 10 9.25Z" />
      </svg>
    ),
  },
  {
    to: '/team',
    label: 'Team',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M7 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM14.5 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 11a4.5 4.5 0 0 0-2.26.61c.34.588.54 1.268.54 2.01a8.01 8.01 0 0 0 .16 1.605c.47.04.93.18 1.32.41l.03.02c.67.49 1.16 1.16 1.41 1.94A3.5 3.5 0 0 1 14.5 20H18a1 1 0 0 0 1-1v-1.126c0-1.081-.52-2.094-1.4-2.724A4.088 4.088 0 0 0 14.5 11Z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.043a1 1 0 0 1-.23 1.231l-1.216 1.107a7.049 7.049 0 0 1 0 2.228l1.216 1.107a1 1 0 0 1 .23 1.231l-1.18 2.043a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.043a1 1 0 0 1 .23-1.231l1.216-1.107a7.049 7.049 0 0 1 0-2.228L2.054 6.277a1 1 0 0 1-.23-1.231l1.18-2.043a1 1 0 0 1 1.186-.447l1.598.54A6.993 6.993 0 0 1 7.717 2.01l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
      </svg>
    ),
  },
]

type SidebarProps = {
  email: string
  onSignOut: () => void
}

export default function Sidebar({ email, onSignOut }: SidebarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-office-border bg-office-surface">
      <div className="flex h-14 items-center gap-2.5 border-b border-office-border px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          M
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">MCA Broker</p>
          <p className="truncate text-[11px] text-ink-muted">CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-secondary hover:bg-office-raised hover:text-ink',
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-office-border p-3">
        <p className="truncate px-3 text-xs text-ink-muted" title={email}>
          {email}
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-2 w-full rounded-lg border border-office-border bg-office-raised px-3 py-2 text-left text-sm font-medium text-ink-secondary transition hover:border-office-border-strong hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
