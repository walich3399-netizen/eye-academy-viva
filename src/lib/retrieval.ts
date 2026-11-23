export interface Chunk {
  id: string
  page: number
  section: string
  text: string
}

export interface Hit {
  chunk: Chunk
  score: number
}

const STOP = new Set(
  'a an and are as at be but by for from has have he her his i if in into is it its of on or she so that the their then there these they this to was were will with would you your we our can should could not no do does did than also any may might who what which when how why about after before'.split(
    ' ',
  ),
)

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%./\- ]+/g, ' ')
    .replace(/[./-]+(?=\s|$)/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem)
}

export class Bm25 {
  private docs: { chunk: Chunk; tf: Map<string, number>; len: number }[]
  private df = new Map<string, number>()
  private avgLen: number
  constructor(chunks: Chunk[], private k1 = 1.4, private b = 0.75) {
    this.docs = chunks.map((chunk) => {
      const toks = tokenize(`${chunk.section} ${chunk.section} ${chunk.text}`)
      const tf = new Map<string, number>()
      toks.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1))
      tf.forEach((_, t) => this.df.set(t, (this.df.get(t) ?? 0) + 1))
      return { chunk, tf, len: toks.length }
    })
    this.avgLen = this.docs.reduce((a, d) => a + d.len, 0) / Math.max(1, this.docs.length)
  }

  search(query: string, k = 5): Hit[] {
    const q = [...new Set(tokenize(query))]
    const N = this.docs.length
    const hits = this.docs.map((d) => {
      let score = 0
      for (const t of q) {
        const f = d.tf.get(t)
        if (!f) continue
        const n = this.df.get(t) ?? 0
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
        score += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen))
      }
      return { chunk: d.chunk, score }
    })
    return hits
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[“”"]/g, '"').replace(/[’]/g, "'").trim()

export function isVerbatim(quote: string, chunk: Chunk): boolean {
  const q = norm(quote).replace(/^\.+|\.+$/g, '').replace(/^…|…$/g, '').trim()
  return q.length >= 12 && norm(chunk.text).includes(q)
}

export function bestSentence(claim: string, chunk: Chunk): string {
  const want = new Set(tokenize(claim))
  const sentences = chunk.text.split(/(?<=[.!?])\s+(?=[A-Z(])/)
  let best = sentences[0] ?? chunk.text
  let bestScore = -1
  for (const s of sentences) {
    const score = tokenize(s).filter((t) => want.has(t)).length
    if (score > bestScore) (best = s), (bestScore = score)
  }
  return best
}
