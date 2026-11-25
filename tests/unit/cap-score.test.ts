// The cap on the model's fit score: its own list of missing requirements, the years a posting
// asks for, a required degree and the posting's seniority keep a generous score honest.
// Run with: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capFit, capScore } from '../../server/scout/cap.ts'

const NOW = Date.parse('2026-09-27') // about half a year of IT work
const LATE_NOV = Date.parse('2026-11-25') // about eight months
const cap = (score: number, missing: number, years: number, now = NOW) => capScore(score, missing, years, now)

test('a posting he meets fully keeps the model score', () => {
  assert.equal(cap(92, 0, 0), 92)
  assert.deepEqual(capFit(92, { missing: [], years: 0, level: 'junior' }, NOW), { score: 92, reason: null })
})

test('missing requirements cap the score', () => {
  assert.equal(cap(92, 1, 0), 78)
  assert.equal(cap(92, 2, 0), 78)
  assert.equal(cap(92, 3, 0), 60)
  assert.equal(cap(92, 5, 0), 60)
})

test('asking for more experience than he has caps the score, harder the bigger the gap', () => {
  assert.equal(cap(85, 0, 1), 55, 'a year asked, half a year had')
  assert.equal(cap(85, 0, 1, LATE_NOV), 85, 'eight months in, a year asked is within reach')
  assert.equal(cap(85, 0, 2, LATE_NOV), 55, 'NTT: 2-4 years asked, scored 70 before')
  assert.equal(cap(85, 0, 2, NOW), 45, 'two years asked with half a year had')
  assert.equal(cap(85, 0, 3), 35, 'three years is out of reach whatever the date')
})

test('a required university degree caps the score, in either language', () => {
  for (const m of ['university degree', 'VŠ vzdělání', 'vysokoškolské vzdělání', "Bachelor's degree in CS"]) {
    assert.equal(capFit(90, { missing: [m], years: 0 }, NOW).score, 45, m)
  }
  assert.equal(capFit(90, { missing: ['Kotlin'], years: 0 }, NOW).score, 78, 'a technology is not a degree')
})

test("the posting's own seniority caps the score", () => {
  assert.equal(capFit(90, { missing: [], years: 0, level: 'senior' }, NOW).score, 35, 'Comgate wanted a senior')
  assert.equal(capFit(90, { missing: [], years: 0, level: 'medior' }, NOW).score, 60)
  assert.equal(capFit(90, { missing: [], years: 0, level: 'unspecified' }, NOW).score, 90)
})

test('the tightest cap wins, says why, and a cap never raises a score', () => {
  assert.deepEqual(capFit(92, { missing: ['C#', 'university degree'], years: 1, level: 'senior' }, NOW), {
    score: 35,
    reason: 'written for a senior candidate',
  })
  assert.deepEqual(capFit(92, { missing: [], years: 3 }, NOW), { score: 35, reason: 'asks for 3 years of experience' })
  assert.deepEqual(capFit(40, { missing: [], years: 0, level: 'medior' }, NOW), { score: 40, reason: null })
  assert.equal(cap(0, 0, 0), 0)
})
