import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getCase } from '../lib/viva.functions'
import { createAttempt, listAttempts, type Attempt } from '../lib/attempts'
import { SignIn, logout, useAuth } from '../lib/useAuth'

export const Route = createFileRoute('/')({
  ssr: false,
  loader: () => getCase(),
  component: Home,
})

function Home() {
  const c = Route.useLoaderData()
  const { user, ready } = useAuth()
  const nav = useNavigate()
  const [attempts, setAttempts] = useState<Attempt[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!user) return setAttempts(null)
    listAttempts(user.uid).then(setAttempts, (e) => setErr(e.message))
  }, [user])

  if (!ready) return <main className="wrap"><p>Loading…</p></main>

  const start = async () => {
    if (!user) return
    const id = await createAttempt(user.uid, c.caseId, c.openingPrompt)
    nav({ to: '/attempt/$attemptId', params: { attemptId: id } })
  }

  return (
    <main className="wrap">
      <header className="top">
        <h1>Voice viva</h1>
        {user && (
          <span>
            <span className="muted">{user.email}</span> <button className="link" onClick={() => logout()}>Sign out</button>
          </span>
        )}
      </header>
      <p className="muted">{c.disclaimer}</p>
      {!user ? (
        <SignIn />
      ) : (
        <>
          <div className="card">
            <h2>{c.title}</h2>
            <p>{c.openingPrompt}</p>
            <button className="btn primary" onClick={start}>Start a new viva</button>
          </div>
          <h2>Your attempts</h2>
          {err && <p className="error" role="alert">{err}</p>}
          {attempts === null ? (
            <p className="muted">Loading…</p>
          ) : attempts.length === 0 ? (
            <p className="muted">No attempts yet.</p>
          ) : (
            <ul className="list">
              {attempts.map((a) => (
                <li key={a.id}>
                  <a href={`/attempt/${a.id}`}>{new Date(a.createdAt).toLocaleString()}</a>
                  <span className="muted"> · {a.phase === 'done' ? 'finished' : 'in progress'} · {a.revealed.length} findings revealed</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
