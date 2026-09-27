// The cap on the model's fit score: its own list of missing requirements and the years a posting
// asks for keep a generous score honest. Run with: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capScore } from '../../server/scout/cap.ts'

const NOW = Date.parse('2026-09-27') // about half a year of IT work
const cap = (score: number, missing: number, years: number, now = NOW) => capScore(score, missing, years, now)

test('a posting he meets fully keeps the model score', () => {
  assert.equal(cap(92, 0, 0), 92)
})

test('missing requirements cap the score', () => {
  assert.equal(cap(92, 1, 0), 78)
  assert.equal(cap(92, 2, 0), 78)
  assert.equal(cap(92, 3, 0), 60)
  assert.equal(cap(92, 5, 0), 60)
})

test('asking for more experience than he has caps the score', () => {
  assert.equal(cap(85, 0, 1), 70, 'a year asked, half a year had')
  assert.equal(cap(85, 0, 3), 50, 'three years is out of reach whatever the date')
})

test('the experience cap loosens by itself as time passes', () => {
  assert.equal(cap(85, 0, 1, Date.parse('2027-01-15')), 85, 'nine months in, a year asked is within reach')
})

test('the tightest cap wins, and a cap never raises a score', () => {
  assert.equal(cap(92, 3, 3), 50)
  assert.equal(cap(55, 3, 0), 55)
  assert.equal(cap(0, 0, 0), 0)
})
