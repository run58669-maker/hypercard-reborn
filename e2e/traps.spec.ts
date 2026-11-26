import { expect, test, type Page } from '@playwright/test'

// Requirement 7 on the real page (task 18.5): three scripts that used to leave
// the page unusable. Each test also checks that the page logged no error.

const STOPPED = 'Stopped: openCard scripts kept sending the stack from card to card. Flip the card to fix its script.'
const SELF_LOOP = 'on openCard\n  go to card 1\nend openCard\n'
const FIXED = 'on openCard\n  put "Hello, Kiro!" into field "greeting"\nend openCard\n'
const DEEP = `on openCard\n  put ${'('.repeat(200)}1${')'.repeat(200)} into field "greeting"\nend openCard\n`
const FLOOD = 'on openCard\n  repeat forever\n    answer "hi"\n  end repeat\nend openCard\n'

/**
 * Opens the page with the bundled cards and returns the list that collects
 * what the page logs as an error. The first test reloads to prove that the
 * stop survives, so storage is cleared once by hand and not by an init script.
 */
async function open(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  await page.goto('/')
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
  await page.reload()
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  return errors
}

async function flipTo(page: Page, face: 'front' | 'back'): Promise<void> {
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', face)
}

async function commit(page: Page, script: string): Promise<void> {
  await page.getByTestId('script-editor').fill(script)
  await page.getByTestId('commit-script').click()
}

test('a card that sends the stack to itself stops with a message, also after a reload, and can be fixed on its back', async ({ page }) => {
  const errors = await open(page)

  // 7.1: the commit returns. The script moved the stack, so the card was drawn again and shows its front.
  await flipTo(page, 'back')
  await commit(page, SELF_LOOP)
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'front')
  await expect(page.getByTestId('status-line')).toHaveText(STOPPED)
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')

  // 7.2: the stored script loops on every load, and the page still draws and navigates.
  await page.reload()
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('status-line')).toHaveText(STOPPED)
  await page.getByTestId('card-next').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')
  await expect(page.getByTestId('status-line')).toHaveText('')
  await page.getByTestId('card-prev').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('status-line')).toHaveText(STOPPED)

  // 7.2: the card is fixed where the message says, without a reload.
  await flipTo(page, 'back')
  await expect(page.getByTestId('stored-script')).toHaveText(SELF_LOOP)
  await commit(page, FIXED)
  await expect(page.getByTestId('parse-error')).toBeHidden()
  await expect(page.getByTestId('stored-script')).toHaveText(FIXED)
  await flipTo(page, 'front')
  await expect(page.getByTestId('status-line')).toHaveText('')
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, Kiro!')

  expect(errors).toEqual([])
})

test('a script nested 200 parentheses deep is refused with the limit, and the stored script stays', async ({ page }) => {
  const errors = await open(page)

  await flipTo(page, 'back')
  const stored = await page.getByTestId('stored-script').textContent()
  expect(stored).toContain('Hello, world!')
  await commit(page, DEEP)

  // 7.4: a parse error at the parenthesis that would open level 65 (column 7 holds the first one).
  await expect(page.getByTestId('parse-error')).toBeVisible()
  await expect(page.getByTestId('parse-error')).toContainText(
    'Line 2, column 71: expression too long or nested too deeply (limit 64)',
  )
  // 4.3: the draft stays in the editor, and the last valid script stays stored and running.
  await expect(page.getByTestId('script-editor')).toHaveValue(DEEP)
  expect(await page.getByTestId('stored-script').textContent()).toBe(stored)
  await flipTo(page, 'front')
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await expect(page.getByTestId('status-line')).toHaveText('')

  expect(errors).toEqual([])
})

test('a script that keeps asking for dialogs shows ten of them and then lets go of the card', async ({ page }) => {
  const errors = await open(page)

  await flipTo(page, 'back')
  await commit(page, FLOOD)

  // 7.6: ten dialogs, one press of OK each, and no eleventh.
  for (let press = 1; press <= 10; press += 1) {
    await expect(page.getByTestId('answer-dialog'), `dialog ${String(press)}`).toBeVisible()
    await expect(page.getByTestId('answer-dialog')).toContainText('hi')
    await page.getByTestId('answer-ok').click()
  }
  await expect(page.getByTestId('answer-dialog')).toHaveCount(0)

  // The card says why the script stopped, and Flip works in both directions.
  await flipTo(page, 'front')
  await expect(page.getByTestId('status-line')).toHaveText(
    'Runtime error in openCard, line 3: too many answer dialogs (limit 10)',
  )
  await flipTo(page, 'back')
  await expect(page.getByTestId('stored-script')).toHaveText(FLOOD)

  expect(errors).toEqual([])
})

// Requirement 7.8 (task 18.7): a card whose openCard moves the stack on once never trips the stop.
test('a card that sends the stack away is named in a notice and can be opened and fixed without running it', async ({ page }) => {
  const errors = await open(page)
  const AWAY = 'on openCard\n  go to card 1\nend openCard\n'
  const STAYS = 'on openCard\n  put "7" into field "count"\nend openCard\n'

  await expect(page.getByTestId('moved-notice')).toBeHidden()
  await page.getByTestId('card-next').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')
  await flipTo(page, 'back')
  await commit(page, AWAY)

  // The commit moved the stack to card 1, and Next brings it straight back.
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('moved-notice')).toBeVisible()
  // The button the commit brought works straight away.
  await page.getByTestId('open-held-2').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')
  await page.getByTestId('card-prev').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('moved-notice')).toBeHidden()
  await page.getByTestId('card-next').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('open-held-2')).toHaveText('Card 2: Counter')

  // Also after a reload, where the notice is gone until the stack jumps again.
  await page.reload()
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')
  await expect(page.getByTestId('moved-notice')).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')

  // The button opens card 2 on its back; its openCard did not run.
  await page.getByTestId('open-held-2').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')
  await expect(page.getByTestId('stored-script')).toHaveText(AWAY)
  await expect(page.getByTestId('moved-notice')).toBeHidden()

  // The cards behind it are reachable again.
  await page.getByTestId('card-next').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 3 of 6')
  await page.getByTestId('card-prev').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 1 of 6')

  // And the script can be changed there.
  await page.getByTestId('open-held-2').click()
  await commit(page, STAYS)
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')
  await flipTo(page, 'front')
  await expect(page.getByTestId('status-line')).toHaveText('')
  await expect(page.getByTestId('field-count')).toHaveValue('7')
  await page.getByTestId('card-prev').click()
  await page.getByTestId('card-next').click()
  await expect(page.getByTestId('card-position')).toHaveText('Card 2 of 6')
  await expect(page.getByTestId('moved-notice')).toBeHidden()

  expect(errors).toEqual([])
})
