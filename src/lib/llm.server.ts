import Anthropic from '@anthropic-ai/sdk'
import type { CaseData } from './findings'
import { Bm25, bestSentence, isVerbatim, type Chunk } from './retrieval'

const MODEL = () => process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5'
export const llmEnabled = () => !!process.env.ANTHROPIC_API_KEY

async function complete(system: string, user: string, maxTokens = 400): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

function parseJson<T>(s: string): T | null {
  const m = s.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as T
  } catch {
    return null
  }
}

export async function followUpQuestion(c: CaseData, answer: string): Promise<{ text: string; source: 'llm' | 'fallback' }> {
  const ideas = c.examiner_notes.follow_up_ideas
  if (llmEnabled()) {
    try {
      const out = await complete(
        'You are an ophthalmology viva examiner speaking aloud to a trainee. Ask exactly ONE short follow-up question (max 30 words, one sentence, no preamble, no list). It must respond to what the trainee actually said: probe a specific claim they made, or the most important thing they omitted. Do not reveal the answer or the diagnosis. Prefer one of the examiner ideas if it fits what they said.',
        `Examiner ideas: ${JSON.stringify(ideas)}\nKey points the examiner is looking for (hidden from trainee): ${JSON.stringify(c.examiner_notes.key_points)}\n\nTrainee's answer (diagnosis and management):\n"""${answer}"""\n\nYour single follow-up question:`,
        120,
      )
      const text = out.trim().replace(/^["']|["']$/g, '')
      if (text) return { text, source: 'llm' }
    } catch (e) {
      console.error('[llm] follow-up failed, using fallback:', (e as Error).message)
    }
  }
  const a = answer.toLowerCase()
  const q = !/both eyes|left eye|fellow|other eye|prophyl/.test(a) ? ideas[0] : !/pilocarpine/.test(a) ? ideas[1] : ideas[2]
  return { text: q, source: 'fallback' }
}

export interface RevisionResult {
  status: 'supported' | 'unsupported'
  message: string
  point?: string
  citation?: { page: number; chunkId: string; section: string; excerpt: string; excerptRepaired: boolean }
  retrieved: { chunkId: string; page: number; score: number; section: string }[]
  gap?: string
  query?: string
  source: 'llm' | 'fallback'
}

const MIN_TOP_SCORE = 3

export async function revisionPoint(
  c: CaseData,
  bm: Bm25,
  trainee: { answer: string; followUpQuestion: string; followUpAnswer: string },
): Promise<RevisionResult> {
  const transcript = `Diagnosis/management answer: ${trainee.answer}\nExaminer follow-up: ${trainee.followUpQuestion}\nTrainee reply: ${trainee.followUpAnswer}`
  let gap = ''
  let query = ''
  let usedLlm = false

  if (llmEnabled()) {
    try {
      const out = await complete(
        'You mark an ophthalmology viva. From the trainee transcript pick the SINGLE most important error, omission or shaky claim to revise (prefer safety-critical ones). Return JSON only: {"gap": "<one sentence describing it>", "query": "<8-14 keywords a textbook would use for the correct teaching on this>"}',
        `Examiner's hidden key points: ${JSON.stringify(c.examiner_notes.key_points)}\n\nTranscript:\n${transcript}`,
        250,
      )
      const j = parseJson<{ gap?: string; query?: string }>(out)
      if (j?.gap && j?.query) {
        gap = j.gap
        query = j.query
        usedLlm = true
      }
    } catch (e) {
      console.error('[llm] gap step failed, using fallback:', (e as Error).message)
    }
  }
  if (!query) {
    const t = transcript.toLowerCase()
    const checks: [RegExp, string, string][] = [
      [/sulfonamide|allerg/, 'Did not check the sulfonamide allergy before acetazolamide', 'acetazolamide sulfonamide allergy check before giving'],
      [/chlorphenamine|antihistamine|anticholinergic/, 'Did not identify the trigger drug', 'triggers anticholinergic antihistamine chlorphenamine dim light pupil'],
      [/both eyes|fellow|left eye|prophyl/, 'Did not treat the fellow eye', 'prophylactic laser peripheral iridotomy fellow eye'],
      [/pilocarpine/, 'Pilocarpine timing', 'pilocarpine ischaemic iris sphincter IOP very high works better once pressure falls'],
    ]
    const miss = checks.find(([re]) => !re.test(t)) ?? checks[2]
    gap = miss[1]
    query = miss[2]
  }

  const hits = bm.search(`${query} ${query} ${trainee.answer}`, 6)
  const retrieved = hits.map((h) => ({
    chunkId: h.chunk.id,
    page: h.chunk.page,
    score: Math.round(h.score * 100) / 100,
    section: h.chunk.section,
  }))
  const base = { retrieved, gap, query, source: (usedLlm ? 'llm' : 'fallback') as 'llm' | 'fallback' }

  if (!hits.length || hits[0].score < MIN_TOP_SCORE) {
    return {
      status: 'unsupported',
      message: "I couldn't find support for a revision point on this in the reference note, so I won't give you one. Check your local guidance.",
      ...base,
    }
  }

  let chosen: Chunk | undefined
  let point = ''
  let quote = ''
  if (usedLlm) {
    try {
      const passages = hits.map((h) => `[${h.chunk.id}] (page ${h.chunk.page}, ${h.chunk.section}) ${h.chunk.text}`).join('\n\n')
      const out = await complete(
        'You write ONE revision point for a trainee, using ONLY the numbered passages given. Do not use outside knowledge. If no passage directly supports teaching on the gap, return {"supported": false}. Otherwise return JSON only: {"supported": true, "chunk_id": "<id of the single best passage>", "revision_point": "<1-2 sentences addressed to the trainee, restating what the passage says>", "quote": "<an exact, contiguous quote of 6-30 words copied from that passage>"}',
        `Gap in the trainee's answer: ${gap}\n\nPassages:\n${passages}`,
        400,
      )
      const j = parseJson<{ supported?: boolean; chunk_id?: string; revision_point?: string; quote?: string }>(out)
      if (j && j.supported === false) {
        return {
          status: 'unsupported',
          message: "The reference note doesn't contain support for a revision point on this, so I won't invent one.",
          ...base,
        }
      }
      const ch = hits.find((h) => h.chunk.id === j?.chunk_id)?.chunk
      if (j?.revision_point && ch) {
        chosen = ch
        point = j.revision_point.trim()
        quote = (j.quote ?? '').trim()
      }
    } catch (e) {
      console.error('[llm] revision step failed, using extractive fallback:', (e as Error).message)
    }
  }
  if (!chosen) {
    chosen = hits[0].chunk
    quote = bestSentence(query, chosen)
    point = `${gap}. The note says: “${quote}”`
  }

  let excerptRepaired = false
  if (!isVerbatim(quote, chosen)) {
    quote = bestSentence(`${point} ${gap}`, chosen)
    excerptRepaired = true
  }
  return {
    status: 'supported',
    message: point,
    point,
    citation: { page: chosen.page, chunkId: chosen.id, section: chosen.section, excerpt: quote, excerptRepaired },
    ...base,
  }
}
