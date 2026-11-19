import { expect, test } from '@playwright/test'

const COUNTER_DESCRIPTION =
  'The card has a field "count" and a button "Increment". When the card opens, set the count to 0. When the button is clicked, add one to the count.'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
})

test('compile offline: the counter chip turns the hello card into a counter; an unknown description keeps the previous script; no network', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('load')
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')

  // Pick the counter chip and Save: compile once, store, re-run.
  await page.getByTestId('chip-counter').click()
  await expect(page.getByTestId('description-input')).toHaveValue(COUNTER_DESCRIPTION)
  await page.getByTestId('save-description').click()
  await expect(page.getByTestId('save-description')).toBeEnabled()
  await expect(page.getByTestId('compile-error')).toBeHidden()
  await expect(page.getByTestId('stored-script')).toContainText('if the target is "Increment" then')
  await expect(page.getByTestId('script-origin')).toContainText('compiled offline at')
  await expect(page.getByTestId('stale-notice')).toBeHidden()

  // The front face (still the hello layout) now runs the counter script: its
  // openCard puts 0 into field "count", which this card does not have, so the
  // status line reports it; the greeting field is left alone.
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('status-line')).toHaveText('Runtime error in openCard, line 2: field "count" does not exist')

  // An unknown description: the no-match message, the previous script still shown and running.
  await page.getByTestId('flip').click()
  await page.getByTestId('description-input').fill('Make the card purple.')
  await page.getByTestId('save-description').click()
  await expect(page.getByTestId('compile-error')).toBeVisible()
  await expect(page.getByTestId('compile-error')).toHaveText(
    'The offline compiler only knows the six bundled descriptions. Pick one from the list, or add an Anthropic key in Settings.',
  )
  await expect(page.getByTestId('compile-candidate')).toHaveCount(0)
  await expect(page.getByTestId('stored-script')).toContainText('if the target is "Increment" then')
  await expect(page.getByTestId('stale-notice')).toBeVisible()
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('status-line')).toHaveText('Runtime error in openCard, line 2: field "count" does not exist')

  const afterLoad = requests.filter((url) => !url.endsWith('/') && !url.includes('/index.html'))
  expect(afterLoad).toEqual([])
})

test('compile offline on the counter card itself gives a working Increment button', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('card-next').click()
  await expect(page.getByTestId('card-name')).toHaveText('Counter')
  await page.getByTestId('flip').click()
  // Replace the bundled script with the empty one first, so the compile visibly restores behaviour.
  await page.getByTestId('script-editor').fill('')
  await page.getByTestId('commit-script').click()
  await expect(page.getByTestId('stored-script')).toHaveText('')
  await page.getByTestId('chip-counter').click()
  await page.getByTestId('save-description').click()
  await expect(page.getByTestId('stored-script')).toContainText('on mouseUp')
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('field-count')).toHaveValue('0')
  await page.getByTestId('button-increment').click()
  await expect(page.getByTestId('field-count')).toHaveValue('1')
})
