export type Eye = 'right' | 'left' | 'both' | null

export interface CaseFinding {
  id: string
  eye: Eye
  label: string
  value: string | number | null
  unit: string | null
  method: string | null
  available: boolean
  unavailable_reason?: string
}

export interface CaseData {
  case_id: string
  title: string
  opening_prompt: string
  patient: {
    age: number
    sex: string
    presenting_complaint: string
    past_ocular_history: string
    past_medical_history: string
    medications: string[]
    allergies: string
    family_history: string
  }
  findings: CaseFinding[]
  examiner_notes: { diagnosis: string; key_points: string[]; follow_up_ideas: string[] }
}

export interface Revealed {
  id: string
  eye: Eye
  label: string
  available: boolean
  display: string
  spoken: string
  method?: string
  reason?: string
}

export function historyFindings(c: CaseData): CaseFinding[] {
  const p = c.patient
  const h = (id: string, label: string, value: string): CaseFinding => ({
    id,
    eye: null,
    label,
    value,
    unit: null,
    method: 'History',
    available: true,
  })
  return [
    h('hx_complaint', 'Presenting complaint', p.presenting_complaint),
    h('hx_ocular', 'Past ocular history', p.past_ocular_history),
    h('hx_medical', 'Past medical history', p.past_medical_history),
    h('hx_meds', 'Medications', p.medications.join('; ')),
    h('hx_allergies', 'Allergies', p.allergies),
    h('hx_family', 'Family history', p.family_history),
  ]
}

interface Topic {
  single?: string
  right?: string
  left?: string
  re: RegExp
}

const TOPICS: Topic[] = [
  { single: 'bp', re: /blood pressure|\bbp\b|systemic pressure/ },
  { single: 'u_and_e', re: /urea|electrolyte|\bu&e\b|\bbloods?\b|renal function|kidney function|potassium|creatinine|\be?gfr\b/ },
  { single: 'rapd', re: /\brapd\b|afferent|swinging/ },
  { single: 'axial_length', re: /axial length|biometry|a-scan|\ba scan\b/ },
  { single: 'oct', re: /\boct\b|optical coherence/ },
  { single: 'refraction', re: /refraction|refractive|glasses|spectacle|prescription|focimetry|lensometry/ },
  { right: 'gonio_right', left: 'gonio_left', re: /gonioscop|\bgonio\b|drainage angle|iridotrabecular|\bangles?\b(?!\s+closure)/ },
  { right: 'fundus_right', left: 'fundus_left', re: /fundus|fundoscop|ophthalmoscop|optic (?:disc|disk|nerve)|\bdisc\b|\bdisk\b|\bcup\b|cupping|macula|retina/ },
  { right: 'iop_right', left: 'iop_left', re: /intraocular|\biop\b|eye pressure|tonometr|applanation|\bpressures?\b/ },
  { right: 'va_right', left: 'va_left', re: /visual acuit|\bacuity|\bvision\b|snellen|\bva\b/ },
  { right: 'conj_right', left: 'conj_left', re: /conjunctiv|redness|injection|ciliary flush|\bred\b/ },
  { right: 'cornea_right', left: 'cornea_left', re: /cornea|corneal/ },
  { right: 'ac_right', left: 'ac_left', re: /anterior chamber|chamber depth|van herick|\ba\.?c\.?\b|\bchamber\b/ },
  { right: 'pupil_right', left: 'pupil_left', re: /pupil/ },
  { right: 'lens_right', left: 'lens_left', re: /\blens\b|cataract|nuclear|sclerosis/ },
  { single: 'hx_meds', re: /medication|medicines?|\bdrugs?\b|tablets?|what is she taking|\bmeds\b/ },
  { single: 'hx_allergies', re: /allerg/ },
  { single: 'hx_family', re: /family history|\bfamily\b|runs in the family/ },
  { single: 'hx_ocular', re: /past ocular|previous eye|eye surgery|ocular history/ },
  { single: 'hx_medical', re: /past medical|medical history|comorbid|\bhypertension\b/ },
  { single: 'hx_complaint', re: /presenting complaint|\bsymptoms?\b|\bhistory of (?:the )?presenting|\bhpc\b|\bhistory\b/ },
]

const RIGHT = /\bright\b|\bod\b|\br eye\b/
const LEFT = /\bleft\b|\bos\b|\bl eye\b/
const BOTH = /\bboth\b|\beach\b|\bbilateral\b|\bboth eyes\b|\beither\b/

type EyeSet = Set<'right' | 'left'>

function eyesIn(clause: string): EyeSet {
  const s: EyeSet = new Set()
  if (RIGHT.test(clause)) s.add('right')
  if (LEFT.test(clause)) s.add('left')
  if (BOTH.test(clause)) {
    s.add('right')
    s.add('left')
  }
  return s
}

export interface Intent {
  ids: string[]
  eyeDefaulted: boolean
}

export function parseIntent(raw: string): Intent {
  const text = raw
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\bu\s*(?:and|&)\s*e\b/g, 'u&e')
    .replace(/\s+/g, ' ')
    .trim()
  const clauses = text
    .split(/\s*(?:,|;|\.|\?|!|\band then\b|\bthen\b|\balso\b|\band\b|\bplus\b)\s*/)
    .filter(Boolean)

  type Req = { topic: Topic; eyes: EyeSet | null }
  const reqs: Req[] = []
  let eyeDefaulted = false

  for (const clause of clauses) {
    let rest = clause
    const found: Topic[] = []
    for (const t of TOPICS) {
      if (t.re.test(rest)) {
        found.push(t)
        rest = rest.replace(t.re, ' ')
      }
    }
    const eyes = eyesIn(clause)
    if (found.length === 0) {
      if (eyes.size && reqs.length) {
        const last = reqs[reqs.length - 1]
        const set = last.eyes ?? new Set<'right' | 'left'>()
        eyes.forEach((e) => set.add(e))
        last.eyes = set
      }
      continue
    }
    for (const topic of found) reqs.push({ topic, eyes: eyes.size ? new Set(eyes) : null })
  }

  const ids: string[] = []
  const push = (id: string | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  for (const { topic, eyes } of reqs) {
    if (topic.single) {
      push(topic.single)
      continue
    }
    if (!eyes) eyeDefaulted = true
    const e = eyes ?? new Set<'right' | 'left'>(['right', 'left'])
    if (e.has('right')) push(topic.right)
    if (e.has('left')) push(topic.left)
  }
  return { ids, eyeDefaulted }
}

const eyeWord = (e: Eye) => (e === 'right' ? 'right eye' : e === 'left' ? 'left eye' : e === 'both' ? 'both eyes' : '')

export function displayValue(f: CaseFinding): string {
  if (f.value === null || f.value === undefined) return ''
  const v = String(f.value)
  if (!f.unit) return v
  if (v.toLowerCase().includes(f.unit.toLowerCase())) return v
  if (f.unit === 'dioptres' && /\bDS\b|\bDC\b/.test(v)) return v
  return `${v} ${f.unit}`
}

export function toSpoken(s: string): string {
  return s
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1 over $2')
    .replace(/\bmmHg\b/g, 'millimetres of mercury')
    .replace(/(\d)\s*mm\b/g, '$1 millimetres')
    .replace(/\+(\d)/g, 'plus $1')
    .replace(/(?<![\w])-(\d)/g, 'minus $1')
    .replace(/\bDS\b/g, 'dioptres sphere')
    .replace(/\bSnellen\b/g, 'Snellen')
    .replace(/\bC\/D\b/gi, 'cup to disc')
    .replace(/\bcup-to-disc\b/gi, 'cup to disc')
    .replace(/(\d+)\s*of\s*(\d+)/g, '$1 of $2')
}

export function reveal(f: CaseFinding): Revealed {
  const where = eyeWord(f.eye)
  const head = where ? `${f.label}, ${where}` : f.label
  if (!f.available) {
    const reason = f.unavailable_reason ?? 'not available'
    return {
      id: f.id,
      eye: f.eye,
      label: f.label,
      available: false,
      display: 'Not available',
      spoken: `${head}: not available. ${toSpoken(reason)}.`,
      method: f.method ?? undefined,
      reason,
    }
  }
  const display = displayValue(f)
  const method = f.method ? `, ${f.method}` : ''
  return {
    id: f.id,
    eye: f.eye,
    label: f.label,
    available: true,
    display,
    spoken: `${head}: ${toSpoken(display)}${f.id.startsWith('hx_') ? '' : toSpoken(method)}.`,
    method: f.method ?? undefined,
  }
}

export const UNKNOWN_FINDING: Pick<Revealed, 'display'> = { display: 'Not available' }

export interface LookupResult {
  kind: 'findings' | 'unknown'
  items: Revealed[]
  reply: string
  spoken: string
}

export function lookup(c: CaseData, utterance: string): LookupResult {
  const all = [...c.findings, ...historyFindings(c)]
  const { ids, eyeDefaulted } = parseIntent(utterance)
  const items = ids
    .map((id) => all.find((f) => f.id === id))
    .filter((f): f is CaseFinding => !!f)
    .map(reveal)

  if (items.length === 0) {
    const reply =
      "I don't have that finding available for this case. Ask for another examination finding, or say you are ready to give your diagnosis."
    return { kind: 'unknown', items: [], reply, spoken: reply }
  }
  const lead = eyeDefaulted ? 'You did not say which eye, so here are both. ' : ''
  const body = items.map((i) => i.spoken).join(' ')
  const shown = items
    .map((i) => `${i.label}${i.eye ? ` (${i.eye})` : ''}: ${i.display}${!i.available && i.reason ? ` (${i.reason})` : ''}`)
    .join('\n')
  return {
    kind: 'findings',
    items,
    reply: (lead ? lead + '\n' : '') + shown,
    spoken: lead + body,
  }
}
