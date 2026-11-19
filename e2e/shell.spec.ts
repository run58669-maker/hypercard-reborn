import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
})

test('shows card 1 of 6 running, and Next shows a working counter', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('card-name')).toHaveText('Hello')
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await expect(page.getByTestId('card-prev')).toBeDisabled()

  await page.getByTestId('card-next').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')
  await expect(page.getByTestId('card-name')).toHaveText('Counter')
  await expect(page.getByTestId('field-count')).toHaveValue('0')
  await page.getByTestId('button-increment').click()
  await page.getByTestId('button-increment').click()
  await expect(page.getByTestId('field-count')).toHaveValue('2')

  await page.getByTestId('card-prev').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
})

test('the last card disables Next and the quiz navigates to card 2 after OK', async ({ page }) => {
  await page.goto('/')
  for (let i = 0; i < 5; i += 1) await page.getByTestId('card-next').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 6 of 6')
  await expect(page.getByTestId('card-next')).toBeDisabled()
  await expect(page.getByTestId('field-question')).toHaveValue('What is 2 + 2?')
  await page.getByTestId('field-answer').fill('4')
  await page.getByTestId('button-check').click()
  await expect(page.getByTestId('answer-dialog')).toContainText('Correct!')
  await expect(page.getByTestId('card-position')).toHaveText('Card 6 of 6')
  await page.getByTestId('answer-ok').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')
  await expect(page.getByTestId('field-count')).toHaveValue('0')
})
