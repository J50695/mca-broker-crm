import { FormEvent, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    if (result.error) setError(result.error.message)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-office-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-office-border bg-office-surface p-8 shadow-office-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent font-bold text-lg">
            M
          </div>
          <h1 className="text-xl font-semibold text-ink">MCA Broker CRM</h1>
          <p className="mt-1 text-sm text-ink-secondary">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-office-border bg-office-raised px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-office-border bg-office-raised px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {mode === 'signin' ? 'First time here?' : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="font-medium text-accent hover:underline"
          >
            {mode === 'signin' ? 'Create account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
