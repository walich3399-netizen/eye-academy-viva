import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getCase } from '../lib/viva.functions'
import { loadAttempt, type Attempt } from '../lib/attempts'
import { SignIn, useAuth } from '../lib/useAuth'
import { Viva } from '../components/Viva'

export const Route = createFileRoute('/attempt/$attemptId')({
  ssr: false,
  loader: () => getCase(),
  component: AttemptPage,
})

function AttemptPage() {
  const c = Route.useLoaderData()
  const { attemptId } = Route.useParams()
  const { user, ready } = useAuth()
  const [attempt, setAttempt] = useState<Attempt | null | 'denied'>(null)

  useEffect(() => {
    if (!user) return
    loadAttempt(attemptId).then(
      (a) => setAttempt(a && a.ownerUid === user.uid ? a : 'denied'),
      () => setAttempt('denied'),
    )
  }, [user, attemptId])

  if (!ready) return <main className="wrap"><p>Loading…</p></main>
  if (!user) return <main className="wrap"><SignIn /></main>
  return (
    <main className="wrap">
      <header className="top">
        <h1>{c.title}</h1>
        <Link to="/">← All attempts</Link>
      </header>
      {attempt === null ? (
        <p className="muted">Loading attempt…</p>
      ) : attempt === 'denied' ? (
        <div className="card warn" role="alert">This attempt does not exist or is private to another user.</div>
      ) : (
        <Viva initial={attempt} />
      )}
    </main>
  )
}
