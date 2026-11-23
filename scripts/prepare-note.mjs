import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pdf = resolve(here, '..', '..', 'Eye Academy - Glaucoma_and_Angle_Closure_Reference_Note.pdf')
const out = resolve(here, '..', 'data', 'note-chunks.json')

const raw = execFileSync('pdftotext', ['-enc', 'UTF-8', '-layout', pdf, '-'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
})
const pages = raw.split('\f').filter((p) => p.trim().length > 0)

const MAX_WORDS = 70
const isChrome = (l) =>
  /^\s*eyeacademy\s+Take-home reference note\s*$/.test(l) ||
  /^\s*Glaucoma and angle closure\s*[··�]\s*Eye Academy reference note\s+\d+\s*$/.test(l)

const H2 = new Set([
  'About this note',
  'Aqueous humour and intraocular pressure',
  'Assessing the drainage angle',
  'Primary angle closure',
  'Acute primary angle closure',
  'Managing an acute attack',
  'Laser peripheral iridotomy',
  'Plateau iris',
  'Secondary angle closure',
  'Primary open-angle glaucoma and ocular hypertension',
  'IOP-lowering medicines',
  'Laser and surgery in glaucoma',
  'Sources',
])

const chunks = []
let section = ''
let subsection = ''

const looksLikeHeading = (block) =>
  block.length === 1 &&
  block[0].trim().length < 60 &&
  !/[.:;,]$/.test(block[0].trim()) &&
  !/^\s{3,}/.test(block[0])

pages.forEach((text, i) => {
  const page = i + 1
  const lines = text.split('\n').filter((l) => !isChrome(l))
  const blocks = []
  let cur = []
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) blocks.push(cur), (cur = [])
    } else cur.push(l)
  }
  if (cur.length) blocks.push(cur)

  for (const block of blocks) {
    if (looksLikeHeading(block)) {
      const h = block[0].trim()
      if (H2.has(h)) (section = h), (subsection = '')
      else subsection = h
      continue
    }
    const body = block
      .map((l) => l.trim())
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z(])/)
    let buf = []
    let words = 0
    const flush = () => {
      if (!buf.length) return
      chunks.push({
        id: `p${page}-c${chunks.filter((c) => c.page === page).length + 1}`,
        page,
        section: [section, subsection].filter(Boolean).join(' > '),
        text: buf.join(' '),
      })
      buf = []
      words = 0
    }
    for (const s of sentences) {
      const w = s.split(/\s+/).length
      if (words + w > MAX_WORDS && buf.length) flush()
      buf.push(s)
      words += w
    }
    flush()
  }
})

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ source: 'Glaucoma and angle closure: Eye Academy reference note', pages: pages.length, chunks }, null, 2))
console.log(`Wrote ${chunks.length} chunks from ${pages.length} pages -> ${out}`)
