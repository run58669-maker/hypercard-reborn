import { expect, test } from '@playwright/test'

// Requirement 2.2 for every seeded card: the bytes of the stored-script <pre>
// equal the bytes of that card's script in localStorage, computed inside the
// page with TextEncoder.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
})

const IDS = ['hello', 'counter', 'date-stamp', 'greeter', 'countdown', 'quiz']

test('the stored-script view is byte-identical to localStorage for all six cards', async ({ page }) => {
  await page.goto('/')
  for (const [index, id] of IDS.entries()) {
    if (index > 0) await page.getByTestId('card-next').click()
    await expect(page.getByTestId('card-position')).toHaveText(`Card ${String(index + 1)} of 6`)
    await page.getByTestId('flip').click()
    await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')
    const comparison = await page.evaluate((cardId) => {
      const pre = document.querySelector('[data-testid="stored-script"]')
      const raw = localStorage.getItem('hcr.cards.v1')
      if (pre === null || raw === null) return { ok: false, reason: 'missing pre or storage' }
      const cards = JSON.parse(raw) as { id: string; script: string }[]
      const card = cards.find((c) => c.id === cardId)
      if (card === undefined) return { ok: false, reason: `no card ${cardId} in storage` }
      const shown = new TextEncoder().encode(pre.textContent ?? '')
      const stored = new TextEncoder().encode(card.script)
      const same = shown.length === stored.length && shown.every((byte, i) => byte === stored[i])
      return { ok: same, reason: same ? '' : `byte mismatch for ${cardId}`, length: stored.length }
    }, id)
    expect(comparison, id).toMatchObject({ ok: true })
    expect(comparison.length).toBeGreaterThan(0)
    await page.getByTestId('flip').click()
  }
})
