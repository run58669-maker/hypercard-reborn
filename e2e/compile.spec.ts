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

test('compile offline: the hello card refuses the counter description and keeps its script; an unknown description keeps it too; no network', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('load')
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')

  // Chips follow the card: only the one whose script fits these objects can be picked.
  await expect(page.getByTestId('chip-hello')).toBeEnabled()
  await expect(page.getByTestId('chip-counter')).toBeDisabled()
  await expect(page.getByTestId('chip-counter')).toHaveAttribute('title', /Counter/)

  // Typing the counter description by hand and saving: the compiled script names
  // field "count", which this card does not have, so it is refused and nothing is stored.
  await page.getByTestId('description-input').fill(COUNTER_DESCRIPTION)
  await page.getByTestId('save-description').click()
  await expect(page.getByTestId('save-description')).toBeEnabled()
  // The error block holds the message followed by the rejected candidate.
  await expect(page.getByTestId('compile-error')).toContainText(
    'The compiler produced a script for objects this card does not have (field "count"). This card has: field "greeting". The previous script is still running.',
  )
  await expect(page.getByTestId('compile-candidate')).toContainText('if the target is "Increment" then')
  await expect(page.getByTestId('stored-script')).toContainText('Hello, world!')
  await expect(page.getByTestId('stored-script')).not.toContainText('Increment')

  // The front face still runs the hello script, with no runtime error.
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await expect(page.getByTestId('status-line')).toHaveText('')

  // An unknown description: the no-match message, the previous script still shown and running.
  await page.getByTestId('flip').click()
  await page.getByTestId('description-input').fill('Make the card purple.')
  await page.getByTestId('save-description').click()
  await expect(page.getByTestId('compile-error')).toBeVisible()
  await expect(page.getByTestId('compile-error')).toHaveText(
    'The offline compiler only knows the six bundled descriptions. Pick one from the list, or add an Anthropic key in Settings.',
  )
  await expect(page.getByTestId('compile-candidate')).toHaveCount(0)
  await expect(page.getByTestId('stored-script')).toContainText('Hello, world!')
  // The stored script is still the seeded one, never compiled, so there is no stale notice.
  await expect(page.getByTestId('stale-notice')).toBeHidden()
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await expect(page.getByTestId('status-line')).toHaveText('')

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
