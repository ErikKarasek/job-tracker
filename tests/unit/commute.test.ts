// The commute filter: Hradec Králové and Pardubice, or remote. Run with: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cityFromPsc, reachable } from '../../server/scout/commute.ts'

test('Hradec Králové and Pardubice pass, districts included', () => {
  assert.ok(reachable('Hradec Králové – Pouchov', false))
  assert.ok(reachable('Pardubice – Staré Čívice', false))
  assert.ok(reachable('Pardubice', false))
})

test('towns an hour away do not, unless remote', () => {
  assert.ok(!reachable('Trutnov – Dolní Staré Město', false))
  assert.ok(!reachable('Nymburk', false))
  assert.ok(!reachable('Ústí nad Orlicí', false))
  assert.ok(reachable('Praha – Nové Město', true))
})

test('a region alone is not a town', () => {
  assert.ok(!reachable('Pardubický kraj', false))
  assert.ok(!reachable('Královéhradecký kraj', false))
  assert.ok(!reachable('celá ČR', false))
})

test('an unknown place is kept', () => {
  assert.ok(reachable(null, false))
})

test('the Labour Office postcode names the town', () => {
  assert.equal(cityFromPsc('500 03'), 'Hradec Králové')
  assert.equal(cityFromPsc(53002), 'Pardubice')
  assert.equal(cityFromPsc('541 01'), null, 'Trutnov')
  assert.equal(cityFromPsc(null), null)
})
