import { describe, it, expect, beforeAll } from 'vitest'
import caseData from '../data/case.json'
import notes from '../data/note-chunks.json'
import { Bm25, isVerbatim } from '../src/lib/retrieval'
import { revisionPoint } from '../src/lib/llm.server'
import type { CaseData } from '../src/lib/findings'

const c = caseData as unknown as CaseData
const bm = new Bm25(notes.chunks)

beforeAll(() => { delete process.env.ANTHROPIC_API_KEY })

describe('check 3: the citation supports the revision point', () => {
  it('trainee forgets the sulfonamide allergy -> cites the acetazolamide passage (p5-6)', async () => {
    const r = await revisionPoint(c, bm, {
      answer: 'Right acute angle closure. Give timolol, apraclonidine, intravenous acetazolamide, analgesia, then laser iridotomy to both eyes. Stop the chlorphenamine.',
      followUpQuestion: 'Why treat the left eye as well?',
      followUpAnswer: 'Because the fellow eye is at high risk of an attack.',
    })
    console.log(JSON.stringify({ retrieved: r.retrieved, citation: r.citation, point: r.point }, null, 2))
    expect(r.status).toBe('supported')
    expect(r.point).toMatch(/acetazolamide/i)
    const chunk = notes.chunks.find((x) => x.id === r.citation!.chunkId)!
    expect(chunk.page).toBe(r.citation!.page)
    expect(isVerbatim(r.citation!.excerpt, chunk)).toBe(true)
    expect(r.citation!.excerpt.toLowerCase()).toContain('sulfonamide')
    expect([5, 6]).toContain(r.citation!.page)
  })
  it('off-topic gap -> says so instead of inventing support', async () => {
    const bm2 = new Bm25(notes.chunks)
    const hits = bm2.search('quantum chromodynamics lepton', 3)
    expect(hits).toEqual([])
  })
})
