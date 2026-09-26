import { expect, test, type Page } from '@playwright/test'

const KEY = 'e2e' // the test server's admin key (tests/serve.sh)
const STAGES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected']

// Unique per run, so a test database that persists between local runs never confuses them.
const unique = (name: string) => `${name} ${Date.now().toString(36)}`

const column = (page: Page, stage: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: stage, exact: true }) })
const card = (page: Page, company: string) => page.locator('li').filter({ hasText: company })

async function unlockViaStorage(page: Page, key = KEY) {
  await page.addInitScript((k) => localStorage.setItem('job-tracker.admin-key', k), key)
}

test.describe('a visitor without the key', () => {
  test('sees the five stages and cannot edit', async ({ page }) => {
    await page.goto('/')
    for (const stage of STAGES) await expect(page.getByRole('heading', { name: stage, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Read-only' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ New application' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Inbox' })).toHaveCount(0)
  })

  test('unlocks with the key from the prompt, and locks again', async ({ page }) => {
    await page.goto('/')
    page.once('dialog', (dialog) => dialog.accept(KEY))
    await page.getByRole('button', { name: 'Read-only' }).click()
    await expect(page.getByRole('button', { name: '+ New application' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inbox' })).toBeVisible()

    await page.getByRole('button', { name: 'Unlocked' }).click()
    await expect(page.getByRole('button', { name: '+ New application' })).toHaveCount(0)
  })
})

test.describe('with the key', () => {
  test.beforeEach(async ({ page }) => {
    await unlockViaStorage(page)
    await page.goto('/')
  })

  test('an application goes from wishlist to applied, is edited, and is deleted', async ({ page }) => {
    const company = unique('Playwright Test s.r.o.')
    const role = 'Junior QA tester'

    await page.getByRole('button', { name: '+ New application' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Company').fill(company)
    await dialog.getByLabel('Role').fill(role)
    await dialog.getByLabel('Salary min').fill('30000')
    await dialog.getByLabel('Salary max').fill('40000')
    await dialog.getByRole('button', { name: 'Save' }).click()

    // It lands on the wishlist, salary shown as a range.
    await expect(card(column(page, 'Wishlist'), company)).toBeVisible()
    await expect(card(page, company)).toContainText('30k–40k')

    // Moving it is a select on the card; it leaves Wishlist and appears under Applied.
    await card(page, company).getByLabel(`Move ${role} at ${company} to a different stage`).selectOption('applied')
    await expect(card(column(page, 'Applied'), company)).toBeVisible()
    await expect(card(column(page, 'Wishlist'), company)).toHaveCount(0)

    // Survives a reload: it was saved, not just drawn.
    await page.reload()
    await expect(card(column(page, 'Applied'), company)).toBeVisible()

    await card(page, company).getByRole('button', { name: 'Edit' }).click()
    await dialog.getByLabel('Notes').fill('Called on Monday')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()

    await card(page, company).getByRole('button', { name: 'Edit' }).click()
    await expect(dialog.getByLabel('Notes')).toHaveValue('Called on Monday')
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(card(page, company)).toHaveCount(0)
    await page.reload()
    await expect(card(page, company)).toHaveCount(0)
  })

  test('the funnel counts an application that reached an interview', async ({ page, request }) => {
    const company = unique('Funnel Test a.s.')
    const created = await request.post('/api/applications', {
      headers: { 'x-admin-key': KEY },
      data: { company, role: 'Tester', stage: 'applied' },
    })
    expect(created.status()).toBe(201)
    const { id } = await created.json()
    await request.patch(`/api/applications/${id}`, { headers: { 'x-admin-key': KEY }, data: { stage: 'interview' } })

    await page.getByRole('button', { name: 'Stats' }).click()
    await expect(page.getByText('Total applications')).toBeVisible()
    await expect(page.getByText('Applied → interview')).toBeVisible()

    await request.delete(`/api/applications/${id}`, { headers: { 'x-admin-key': KEY } })
  })
})

test('a wrong key is refused by the server, and the board says so', async ({ page }) => {
  await unlockViaStorage(page, 'not-the-key')
  await page.goto('/')
  await page.getByRole('button', { name: '+ New application' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Company').fill(unique('Should Not Exist'))
  await dialog.getByLabel('Role').fill('Nobody')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alert')).toContainText(/admin key/i)
})
