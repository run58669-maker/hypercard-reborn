import { expect, test } from '@playwright/test'

// Requirements 5.1–5.5, 4.3: keyboard navigation across cards, arrow-key
// guards (editable element, answer dialog, back face), and Escape to flip back.
// No network requests are made after the initial load.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
})

test('ArrowRight five times reaches Card 6 of 6 and no further', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('load')
  const requests: string[] = []
  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`))

  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')

  // 5.1: ArrowRight navigates forward card by card
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('ArrowRight')
  }
  await expect(page.getByTestId('card-position')).toHaveText('Card 6 of 6')

  // 5.1: ArrowRight on the last card does nothing
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('card-position')).toHaveText('Card 6 of 6')

  // 5.3: ArrowLeft in a focused textarea does not change card
  await page.getByTestId('field-answer').click()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('card-position')).toHaveText('Card 6 of 6')

  // 5.4: answer-dialog blocks arrow navigation
  // Fill in the correct answer and open the dialog
  await page.getByTestId('field-answer').fill('4')
  await page.getByTestId('button-check').click()
  await expect(page.getByTestId('answer-dialog')).toBeVisible()
  // Unfocus any element so the guard is purely the dialog presence, not the textarea
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('card-position')).toHaveText('Card 6 of 6')

  // Close the dialog; the quiz script navigates to card 2
  await page.getByTestId('answer-ok').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')

  // 5.2: ArrowLeft navigates backward
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')

  expect(requests).toEqual([])
})

test('ArrowLeft on card 1 stays put', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('load')

  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  // 5.2: ArrowLeft on the first card does nothing
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
})

test('Escape on the back face flips to front', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('load')
  const requests: string[] = []
  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`))

  // 5.5: Flip the card, then press Escape to return to the front face
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')

  // 5.4: Arrow keys do nothing while on the back face
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')

  // 5.5: Escape flips back to front
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'front')

  expect(requests).toEqual([])
})
