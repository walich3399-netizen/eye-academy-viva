import { useCallback, useEffect, useRef, useState } from 'react'
import { askFinding, askFollowUp, makeRevision } from '../lib/viva.functions'
import { saveAttempt, type Attempt, type Msg } from '../lib/attempts'
import type { Revealed } from '../lib/findings'
import { getIdToken } from '../lib/useAuth'
import { listen, speak, sttSupported, stopSpeaking, type Listener } from '../lib/speech'

type Ui = 'idle' | 'listening' | 'thinking' | 'speaking'

const STATUS: Record<Ui, { label: string; cls: string }> = {
  idle: { label: 'Your turn: press the microphone and speak', cls: 'idle' },
  listening: { label: 'Listening… speak now', cls: 'listening' },
  thinking: { label: 'Examiner is thinking…', cls: 'thinking' },
  speaking: { label: 'Examiner is speaking… (microphone is off)', cls: 'speaking' },
}

const READY = /\b(?:i'?m|i am|we are|we're) (?:now )?ready\b|ready to (?:give|answer|diagnose|commit|state)|\bmy diagnosis\b|\bthe diagnosis is\b|\bi(?:'d| would) (?:like to )?(?:give|state) (?:my|the) diagnosis/i

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

export function Viva({ initial }: { initial: Attempt }) {
  const [attempt, setAttempt] = useState<Attempt>(initial)
  const ref = useRef(attempt)
  const [ui, setUi] = useState<Ui>('idle')
  const [interim, setInterim] = useState('')
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved')
  const listener = useRef<Listener | null>(null)
  const logEnd = useRef<HTMLDivElement>(null)
  const done = attempt.phase === 'done'

  const commit = useCallback((a: Attempt) => {
    ref.current = a
    setAttempt(a)
    setSaved('saving')
    saveAttempt(a).then(
      () => setSaved('saved'),
      (e) => {
        console.error(e)
        setSaved('error')
      },
    )
  }, [])

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' })
  }, [attempt.transcript.length])

  useEffect(() => () => (stopSpeaking(), listener.current?.stop()), [])

  const examinerSays = (a: Attempt, text: string, spoken: string, t0: number, serverMs?: number) => {
    const msg: Msg = { role: 'examiner', text, at: Date.now(), serverMs }
    const next = { ...a, transcript: [...a.transcript, msg] }
    commit(next)
    const idx = next.transcript.length - 1
    setUi('speaking')
    speak(spoken, {
      onStart: () => {
        const latencyMs = Math.round(performance.now() - t0)
        const cur = ref.current
        const tr = cur.transcript.slice()
        tr[idx] = { ...tr[idx], latencyMs }
        commit({ ...cur, transcript: tr })
      },
      onEnd: () => setUi('idle'),
    })
  }

  const handleTrainee = async (text: string, t0: number) => {
    setErr('')
    setUi('thinking')
    let a: Attempt = { ...ref.current, transcript: [...ref.current.transcript, { role: 'trainee', text, at: Date.now() }] }
    commit(a)
    try {
      const idToken = await getIdToken()
      let phase = a.phase

      if (phase === 'examining' && READY.test(text) && wordCount(text) < 8) {
        const msg = 'Go ahead: give me your diagnosis and your immediate management.'
        return examinerSays({ ...a, phase: 'awaiting_answer' }, msg, msg, t0)
      }
      if (phase === 'examining' && READY.test(text)) phase = 'awaiting_answer'

      if (phase === 'examining') {
        const r = await askFinding({ data: { idToken, text } })
        const have = new Set(a.revealed.map((x) => x.id + x.eye))
        const fresh: Revealed[] = r.items.filter((i) => !have.has(i.id + i.eye))
        a = { ...a, revealed: [...a.revealed, ...fresh] }
        return examinerSays(a, r.reply, r.spoken, t0, r.serverMs)
      }

      if (phase === 'awaiting_answer') {
        const r = await askFollowUp({ data: { idToken, answer: text } })
        a = { ...a, phase: 'awaiting_followup_answer', answer: text, followUp: r.text }
        return examinerSays(a, r.text, r.text, t0, r.serverMs)
      }

      if (phase === 'awaiting_followup_answer') {
        const r = await makeRevision({
          data: { idToken, answer: a.answer ?? '', followUpQuestion: a.followUp ?? '', followUpAnswer: text },
        })
        a = { ...a, phase: 'done', followUpAnswer: text, revision: r }
        const cite = r.citation ? ` This is from page ${r.citation.page} of the reference note.` : ''
        const spoken = `Thank you, that is the end of the viva. ${r.status === 'supported' ? 'Revision point: ' : ''}${r.message}${cite}`
        return examinerSays(a, `That is the end of the viva. Your revision point is below.`, spoken, t0, r.serverMs)
      }
    } catch (e) {
      console.error(e)
      setErr((e as Error).message || 'Something went wrong')
      setUi('idle')
    }
  }

  const startListening = () => {
    if (ui !== 'idle' || done) return
    stopSpeaking()
    setInterim('')
    setErr('')
    setUi('listening')
    let gotFinal = false
    listener.current = listen({
      onInterim: setInterim,
      onFinal: (t) => {
        gotFinal = true
        const t0 = performance.now()
        setInterim('')
        handleTrainee(t, t0)
      },
      onEnd: () => {
        listener.current = null
        if (!gotFinal) setUi((u) => (u === 'listening' ? 'idle' : u))
      },
      onError: (m) => {
        setErr(`Microphone/speech error: ${m}. You can type instead.`)
        setUi('idle')
      },
    })
  }

  const cancelListening = () => listener.current?.stop()

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault()
    const t = typed.trim()
    if (!t || ui !== 'idle' || done) return
    setTyped('')
    handleTrainee(t, performance.now())
  }

  const readyButton = () => {
    if (ui !== 'idle' || attempt.phase !== 'examining') return
    handleTrainee("I'm ready to give my diagnosis", performance.now())
  }

  const hint =
    attempt.phase === 'examining'
      ? 'Ask for examination findings or history (e.g. “What is the intraocular pressure in the right eye?”).'
      : attempt.phase === 'awaiting_answer'
        ? 'Give your diagnosis and immediate management.'
        : attempt.phase === 'awaiting_followup_answer'
          ? 'Answer the examiner’s follow-up question.'
          : 'Viva finished.'

  const last = [...attempt.transcript].reverse().find((m) => m.role === 'examiner' && m.latencyMs !== undefined)

  return (
    <div className="viva">
      <div className={`status ${STATUS[ui].cls}`} role="status" aria-live="polite">
        <span className="dot" aria-hidden />
        {done ? 'Viva finished' : STATUS[ui].label}
      </div>

      <section aria-label="Transcript" className="log">
        {attempt.transcript.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <b>{m.role === 'examiner' ? 'Examiner' : 'You'}</b>
            <p>{m.text}</p>
            {m.latencyMs !== undefined && (
              <small className="muted">
                {m.latencyMs} ms to first audio{m.serverMs !== undefined ? ` (server ${m.serverMs} ms)` : ''}
              </small>
            )}
          </div>
        ))}
        {interim && (
          <div className="msg trainee interim">
            <b>You</b>
            <p>{interim}…</p>
          </div>
        )}
        <div ref={logEnd} />
      </section>

      {!done && (
        <div className="controls">
          <p className="muted">{hint}</p>
          <div className="row">
            {ui === 'listening' ? (
              <button className="btn rec" onClick={cancelListening}>■ Stop listening</button>
            ) : (
              <button className="btn primary" onClick={startListening} disabled={ui !== 'idle' || !sttSupported()}>
                🎤 Speak
              </button>
            )}
            {attempt.phase === 'examining' && (
              <button className="btn" onClick={readyButton} disabled={ui !== 'idle'}>I’m ready to give my diagnosis</button>
            )}
          </div>
          {!sttSupported() && <p className="warnText">Speech recognition is not available in this browser. Use Chrome or Edge, or type below.</p>}
          <form onSubmit={submitTyped} className="row">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="…or type here"
              aria-label="Type your question or answer"
              disabled={ui !== 'idle'}
            />
            <button className="btn" disabled={ui !== 'idle' || !typed.trim()}>Send</button>
          </form>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}

      <section aria-label="Revealed findings" className="card">
        <h2>Revealed findings <span className="muted">({attempt.revealed.length})</span></h2>
        {attempt.revealed.length === 0 ? (
          <p className="muted">Nothing revealed yet.</p>
        ) : (
          <ul className="findings">
            {attempt.revealed.map((f) => (
              <li key={f.id + f.eye} className={f.available ? '' : 'na'}>
                {f.eye && <span className={`eye ${f.eye}`}>{f.eye === 'right' ? 'RIGHT' : f.eye === 'left' ? 'LEFT' : 'BOTH'}</span>}
                <b>{f.label}</b>
                <span className="val">{f.display}</span>
                {f.available ? f.method && <small className="muted"> · {f.method}</small> : <small className="muted"> · {f.reason}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {attempt.revision && <RevisionCard r={attempt.revision} />}

      <footer className="muted foot">
        {saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Could not save, check your connection' : 'Saved'}
        {last && <> · last turn {last.latencyMs} ms to first audio</>}
      </footer>
    </div>
  )
}

function RevisionCard({ r }: { r: NonNullable<Attempt['revision']> }) {
  return (
    <section aria-label="Revision point" className={`card ${r.status === 'supported' ? 'rev' : 'warn'}`}>
      <h2>Revision point</h2>
      {r.status === 'supported' && r.citation ? (
        <>
          <p>{r.point}</p>
          <blockquote>
            “{r.citation.excerpt}”
            <footer>
              Reference note, <b>page {r.citation.page}</b> · {r.citation.section}
            </footer>
          </blockquote>
        </>
      ) : (
        <p>{r.message}</p>
      )}
      <details>
        <summary>How this was found</summary>
        <p className="muted">
          Gap picked: {r.gap ?? 'n/a'} <br />
          Query: {r.query ?? 'n/a'} <br />
          Pages retrieved: {r.retrieved.length ? r.retrieved.map((h) => `p${h.page} (${h.chunkId}, ${h.score})`).join(', ') : 'none'} <br />
          Generated by: {r.source === 'llm' ? 'language model, from retrieved passages only' : 'extractive fallback (no API key)'}
          {r.citation?.excerptRepaired && ' · excerpt replaced by the closest verbatim sentence'}
        </p>
      </details>
    </section>
  )
}
