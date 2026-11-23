import { describe, it, expect } from 'vitest'
import caseData from '../data/case.json'
import { lookup, parseIntent } from '../src/lib/findings'
import type { CaseData } from '../src/lib/findings'

const c = caseData as unknown as CaseData

describe('check 1: available finding keeps eye, value and unit', () => {
  it('IOP right eye', () => {
    const r = lookup(c, "What's the intraocular pressure in the right eye?")
    expect(r.items.map((i) => i.id)).toEqual(['iop_right'])
    expect(r.items[0].display).toBe('58 mmHg')
    expect(r.spoken).toContain('right eye')
    expect(r.spoken).toContain('58 millimetres of mercury')
    expect(r.spoken).not.toContain('18')
  })
  it('VA is spoken as a fraction, not a date', () => {
    const r = lookup(c, 'visual acuity in the left eye')
    expect(r.items[0].display).toBe('6/9 Snellen')
    expect(r.spoken).toContain('6 over 9')
  })
  it('does not double units already in the value', () => {
    expect(lookup(c, 'right pupil').items[0].display).toBe('Mid-dilated, 5 mm, unreactive to light')
    expect(lookup(c, 'her glasses prescription').items[0].display).toBe('Right +3.50 DS, left +3.25 DS (from her current glasses)')
  })
  it('blood pressure is not confused with eye pressure', () => {
    expect(parseIntent('what is her blood pressure').ids).toEqual(['bp'])
  })
  it('keeps a different eye per topic', () => {
    expect(parseIntent('pressure in the right eye and pupil in the left eye').ids).toEqual(['iop_right', 'pupil_left'])
  })
  it('"right and left eye" continues the previous topic', () => {
    expect(parseIntent('intraocular pressure in the right and left eye').ids).toEqual(['iop_right', 'iop_left'])
  })
  it('says so when no eye is named and returns both, labelled', () => {
    const r = lookup(c, 'what is the intraocular pressure')
    expect(r.items.map((i) => i.eye)).toEqual(['right', 'left'])
    expect(r.spoken.startsWith('You did not say which eye')).toBe(true)
  })
  it('history: medications and allergies are discoverable', () => {
    expect(lookup(c, 'what medications is she on').items[0].display).toContain('Chlorphenamine')
    expect(lookup(c, 'any allergies').items[0].display).toContain('Sulfonamide')
  })
})

describe('check 2: unavailable finding is declared, not invented', () => {
  it('right-eye gonioscopy: no view', () => {
    const r = lookup(c, 'gonioscopy of the right eye')
    expect(r.items[0].available).toBe(false)
    expect(r.items[0].reason).toBe('No view: corneal oedema')
    expect(r.spoken).toContain('not available')
    expect(r.reply).toContain('No view: corneal oedema')
  })
  it('OCT: not performed', () => {
    const r = lookup(c, 'can I have the OCT')
    expect(r.items[0].available).toBe(false)
    expect(r.items[0].reason).toBe('Not performed in casualty')
  })
  it('RAPD is unavailable although the JSON carries explanatory text', () => {
    expect(lookup(c, 'is there an RAPD').items[0].available).toBe(false)
  })
  it('something not in the case at all is never invented', () => {
    const r = lookup(c, 'what does the visual field show')
    expect(r.kind).toBe('unknown')
    expect(r.items).toEqual([])
    expect(r.spoken).toMatch(/don't have that finding/)
  })
})
