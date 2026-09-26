// Unit tests for the scout's title triage, which decides what gets an agent run and in what order.
// Run with: npm run test:unit (Node's own runner, which strips the types; no build step).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { triage } from '../../server/scout/search.ts'

const priority = (title: string) => triage(title).priority
const skipped = (title: string) => triage(title).skip

test('AI and automation work comes first', () => {
  assert.equal(priority('AI Solutions Specialist'), 3)
  assert.equal(priority('Specialista automatizace procesů (RPA)'), 3)
  assert.equal(priority('Vývojář chatbotů'), 3)
  assert.equal(priority('Junior developer – agentní AI'), 3)
  assert.equal(priority('Agentic workflow engineer'), 3)
})

test('a helpdesk "agent" is support work, not AI', () => {
  assert.equal(priority('Support Agent'), 2)
  assert.equal(priority('Service Desk Agent (EN)'), 2)
  assert.equal(priority('Customer Support Agent – IT'), 2)
})

test('junior development, support and IS work come second', () => {
  assert.equal(priority('Junior Frontend Developer (React)'), 2)
  assert.equal(priority('Správce IT / helpdesk'), 2)
  assert.equal(priority('Konzultant implementace ERP'), 2)
  assert.equal(priority('Junior IT specialista'), 2)
})

test('testing and analyst roles are a fallback', () => {
  assert.equal(priority('Tester software'), 0)
  assert.equal(priority('Junior Tester'), 0)
  assert.equal(priority('Business analyst'), 0)
  // ...unless the title also names wanted work
  assert.equal(priority('Programátor / analytik'), 1)
  // ...and testing is not rescued by mentioning automation
  assert.equal(priority('Tester – automatizace testů'), 0)
})

test('senior and non-IT titles are dropped before any agent run', () => {
  assert.ok(skipped('Senior Java Developer'))
  assert.ok(skipped('Vedoucí IT oddělení'))
  assert.ok(skipped('IT manažer'))
  assert.ok(skipped('Team Lead – backend'))
  assert.ok(!skipped('Leadership academy – junior IT'), 'lead must not match inside another word')
  assert.ok(skipped('Technik kvality ve výrobě'))
  // plainly IT work survives an off-topic word
  assert.ok(!skipped('Inženýr SW kvality'))
})
