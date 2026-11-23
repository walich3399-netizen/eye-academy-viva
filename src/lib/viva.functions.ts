import { createServerFn } from '@tanstack/react-start'
import caseData from '../../data/case.json'
import notes from '../../data/note-chunks.json'
import { lookup, type CaseData } from './findings'
import { Bm25 } from './retrieval'
import { requireUid } from './auth.server'
import { followUpQuestion, revisionPoint, llmEnabled } from './llm.server'

const c = caseData as unknown as CaseData
const bm = new Bm25(notes.chunks)

type WithToken<T> = T & { idToken: string }

export const getCase = createServerFn({ method: 'GET' }).handler(async () => ({
  caseId: c.case_id,
  title: c.title,
  openingPrompt: c.opening_prompt,
  disclaimer: (caseData as { disclaimer: string }).disclaimer,
  llm: llmEnabled(),
}))

export const askFinding = createServerFn({ method: 'POST' })
  .validator((d: WithToken<{ text: string }>) => d)
  .handler(async ({ data }) => {
    const t0 = performance.now()
    await requireUid(data.idToken)
    const r = lookup(c, data.text)
    return { ...r, serverMs: Math.round(performance.now() - t0) }
  })

export const askFollowUp = createServerFn({ method: 'POST' })
  .validator((d: WithToken<{ answer: string }>) => d)
  .handler(async ({ data }) => {
    const t0 = performance.now()
    await requireUid(data.idToken)
    const r = await followUpQuestion(c, data.answer)
    return { ...r, serverMs: Math.round(performance.now() - t0) }
  })

export const makeRevision = createServerFn({ method: 'POST' })
  .validator((d: WithToken<{ answer: string; followUpQuestion: string; followUpAnswer: string }>) => d)
  .handler(async ({ data }) => {
    const t0 = performance.now()
    await requireUid(data.idToken)
    const r = await revisionPoint(c, bm, data)
    return { ...r, serverMs: Math.round(performance.now() - t0) }
  })
