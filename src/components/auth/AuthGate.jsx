import { useState, useEffect } from 'react'
import { Lock, Loader2, TrendingUp } from 'lucide-react'
import { authApi } from '../../services/authApi'

// Shows the app only after login (when the server has APP_PASSWORD set).
const AuthGate = ({ children }) => {
  const [state, setState] = useState('checking')   // checking | login | ok | offline
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const check = () => authApi.me()
    .then(r => setState(r.authenticated ? 'ok' : 'login'))
    .catch(() => setState('offline'))

  useEffect(() => {
    check()
    const onLogout = () => setState('login')
    window.addEventListener('auth-required', onLogout)
    return () => window.removeEventListener('auth-required', onLogout)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await authApi.login(password); setPassword(''); setState('ok') }
    catch (err) { setError(err.response?.data?.error || 'Could not reach the server') }
    finally { setBusy(false) }
  }

  if (state === 'ok') return children

  return (
    <div className="min-h-screen bg-dark-400 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-dark-200 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="font-bold tracking-wide">NIFTY Terminal</div>
            <div className="text-[11px] text-gray-500">Private — sign in to continue</div>
          </div>
        </div>

        {state === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={16} className="animate-spin" /> Connecting…</div>
        )}

        {state === 'offline' && (
          <div className="space-y-3">
            <p className="text-sm text-bear">Can't reach the server. It may be starting up or redeploying.</p>
            <button onClick={() => { setState('checking'); check() }}
              className="w-full py-2.5 rounded-xl bg-primary-500/20 border border-primary-500/40 text-primary-300 text-sm font-semibold">
              Try again
            </button>
          </div>
        )}

        {state === 'login' && (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-[11px] text-gray-500">Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input type="password" autoFocus autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-dark-400/80 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white border border-white/[0.08] focus:border-primary-500/40 outline-none" />
            </div>
            {error && <p className="text-xs text-bear">{error}</p>}
            <button type="submit" disabled={busy || !password}
              className="w-full py-2.5 rounded-xl bg-primary-500 text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />} Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default AuthGate
