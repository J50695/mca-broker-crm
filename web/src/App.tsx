import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import PipelineBoard from './pages/PipelineBoard'
import ClientPortal from './pages/ClientPortal'
import SubmissionsPage from './pages/SubmissionsPage'
import IntakePage from './pages/IntakePage'
import PlaceholderPage from './pages/PlaceholderPage'

function AppShell({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  return (
    <div className="flex h-screen overflow-hidden bg-office-bg">
      <Sidebar email={session.user.email ?? ''} onSignOut={onSignOut} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <Routes>
            <Route path="/" element={<PipelineBoard />} />
            <Route path="/clients/:dealId" element={<ClientPortal />} />
            <Route path="/submissions" element={<SubmissionsPage />} />
            <Route
              path="/lenders"
              element={
                <PlaceholderPage
                  title="Lenders"
                  description="View and manage your funder roster, guidelines, and submission contacts."
                />
              }
            />
            <Route path="/intake" element={<IntakePage />} />
            <Route
              path="/team"
              element={
                <PlaceholderPage
                  title="Team"
                  description="Agent roster, assignments, mentions, and team communication."
                />
              }
            />
            <Route
              path="/settings"
              element={
                <PlaceholderPage
                  title="Settings"
                  description="Qualification rules, roles, email templates, and system configuration."
                />
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-office-bg">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <AppShell
      session={session}
      onSignOut={async () => {
        await supabase.auth.signOut()
      }}
    />
  )
}
