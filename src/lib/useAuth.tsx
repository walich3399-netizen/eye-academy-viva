import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, firebaseConfigured } from './firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!auth) return setReady(true)
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setReady(true)
    })
  }, [])
  return { user, ready }
}

export const getIdToken = async () => (auth?.currentUser ? auth.currentUser.getIdToken() : '')

export function SignIn() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')

  if (!firebaseConfigured || !auth) {
    return (
      <div className="card warn" role="alert">
        <h2>Firebase is not configured</h2>
        <p>
          Copy <code>.env.example</code> to <code>.env</code>, fill in the four <code>VITE_FIREBASE_*</code> values, then restart
          the dev server. See the README.
        </p>
      </div>
    )
  }
  const run = async (fn: () => Promise<unknown>) => {
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <div className="card">
      <h2>Sign in to start a viva</h2>
      <button className="btn" onClick={() => run(() => signInWithPopup(auth!, new GoogleAuthProvider()))}>
        Continue with Google
      </button>
      <p className="muted">or with email</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(() => (mode === 'in' ? signInWithEmailAndPassword(auth!, email, pw) : createUserWithEmailAndPassword(auth!, email, pw)))
        }}
      >
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>
        <button className="btn primary" type="submit">
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Need an account? Create one' : 'Have an account? Sign in'}
        </button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  )
}

export const logout = () => (auth ? signOut(auth) : Promise.resolve())
