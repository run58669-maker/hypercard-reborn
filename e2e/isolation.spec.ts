import { expect, test } from '@playwright/test'

// Requirements 1.3 and 4.3: with the offline provider, visiting every card,
// clicking every button, flipping every card and dismissing dialogs makes no
// network request of any kind after load. There is no allow-list.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
})

test('no request leaves the page while every card runs, is clicked and is flipped', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('load')
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  const requests: string[] = []
  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`))

  for (let n = 1; n <= 6; n += 1) {
    if (n > 1) {
      await page.getByTestId('card-next').click()
      await expect(page.getByTestId('card-position')).toHaveText(`Card ${String(n)} of 6`)
    }
    // Give fields something to work with where a button reads them.
    const name = page.getByTestId('field-name')
    if (await name.count()) await name.fill('Ada')
    const answer = page.getByTestId('field-answer')
    if (await answer.count()) await answer.fill('5')

    const buttons = page.locator('[data-testid^="button-"]')
    const count = await buttons.count()
    for (let i = 0; i < count; i += 1) {
      await buttons.nth(i).click()
      const dialog = page.getByTestId('answer-dialog')
      if (await dialog.count()) {
        await page.getByTestId('answer-ok').click()
        await expect(dialog).toHaveCount(0)
      }
    }

    await page.getByTestId('flip').click()
    await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')
    await expect(page.getByTestId('stored-script')).toBeVisible()
    await page.getByTestId('flip').click()
    await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'front')
  }

  // Settings open and close must not fetch either.
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.getByTestId('settings-close').click()

  expect(requests).toEqual([])
})
