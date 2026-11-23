import { describe, it, expect } from 'vitest'
import notes from '../data/note-chunks.json'
import { Bm25, isVerbatim, bestSentence } from '../src/lib/retrieval'

const bm = new Bm25(notes.chunks)

describe('retrieval over the prepared note', () => {
  it('pilocarpine-at-high-IOP query surfaces page 5', () => {
    const hits = bm.search('pilocarpine does not work when the IOP is very high ischaemic iris sphincter', 4)
    expect(hits.some((h) => h.chunk.page === 5)).toBe(true)
  })
  it('fellow eye iridotomy query surfaces page 6', () => {
    const hits = bm.search('prophylactic laser iridotomy in the fellow eye', 4)
    expect(hits.some((h) => h.chunk.page === 6)).toBe(true)
  })
  it('gibberish retrieves nothing', () => {
    expect(bm.search('zxqv plugh', 4)).toEqual([])
  })
  it('verbatim validator', () => {
    const c = notes.chunks.find((x) => x.page === 6 && /fellow eye/.test(x.text))!
    expect(isVerbatim('Prophylactic LPI in the fellow eye', c)).toBe(true)
    expect(isVerbatim('Pilocarpine always lowers pressure instantly', c)).toBe(false)
    expect(bestSentence('fellow eye attack within years', c)).toMatch(/fellow eyes/)
  })
})
