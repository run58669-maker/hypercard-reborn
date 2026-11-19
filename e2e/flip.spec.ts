import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
})

/** Compares the stored-script <pre> with localStorage inside the page, as bytes. */
async function storedScriptMatchesLocalStorage(page: Page, id: string): Promise<boolean> {
  return page.evaluate((cardId) => {
    const pre = document.querySelector('[data-testid="stored-script"]')
    const raw = localStorage.getItem('hcr.cards.v1')
    if (pre === null || raw === null) return false
    const cards = JSON.parse(raw) as { id: string; script: string }[]
    const card = cards.find((c) => c.id === cardId)
    if (card === undefined) return false
    const a = new TextEncoder().encode(pre.textContent ?? '')
    const b = new TextEncoder().encode(card.script)
    return a.length === b.length && a.every((byte, i) => byte === b[i])
  }, id)
}

for (const width of [1280, 600]) {
  test(`flip shows description and script side by side at ${String(width)}px and flips back without re-running`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.getByTestId('card-next').click()
    await expect(page.getByTestId('card-name')).toHaveText('Counter')
    await page.getByTestId('button-increment').click()
    await page.getByTestId('button-increment').click()
    await expect(page.getByTestId('field-count')).toHaveValue('2')

    await page.getByTestId('flip').click()
    await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')
    await expect(page.getByTestId('card-back')).toBeVisible()
    await expect(page.getByTestId('description-input')).toBeVisible()
    await expect(page.getByTestId('stored-script')).toBeVisible()
    await expect(page.getByTestId('description-input')).toHaveValue(/field "count" and a button "Increment"/)
    await expect(page.getByTestId('stored-script')).toContainText('on mouseUp')
    expect(await storedScriptMatchesLocalStorage(page, 'counter')).toBe(true)

    const description = await page.getByTestId('description-input').boundingBox()
    const script = await page.getByTestId('stored-script').boundingBox()
    if (description === null || script === null) throw new Error('back face not laid out')
    if (width >= 720) {
      expect(script.x).toBeGreaterThan(description.x + description.width - 1)
    } else {
      expect(script.y).toBeGreaterThan(description.y + description.height - 1)
    }

    await page.getByTestId('flip').click()
    await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'front')
    await expect(page.getByTestId('field-count')).toBeVisible()
    await expect(page.getByTestId('field-count')).toHaveValue('2')
  })
}
