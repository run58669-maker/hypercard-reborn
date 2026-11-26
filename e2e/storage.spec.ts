import { expect, test, type Page } from '@playwright/test'

// Requirement 8 on the real page. Task 19.1: the browser's storage is filled
// for real, so the write the store makes is refused by localStorage itself.
// Task 19.2: the hash the compile service waits for is held back, so a Commit
// can be made while a Save is still compiling.
// Each test also checks that the page logged no error.

const HELLO = 'on openCard\n  put "Hello, world!" into field "greeting"\nend openCard\n'
const EDITED = 'on openCard\n  put "Hello from a browser with no room left, Kiro!" into field "greeting"\nend openCard\n'
const TYPED = 'When the card opens, greet the reader at some length, so that this text needs more room than the one before it.'

const SAVE_OVERTAKEN =
  'The card changed while this description was compiling, so the compiled script was not stored. Press Save to compile it again.'
const COMMIT_NOT_SAVED =
  "The script was not saved: the browser's storage is full or unavailable. The card still runs the stored script, and your draft is kept here."
const DESCRIPTION_NOT_SAVED =
  "The description was not saved: the browser's storage is full or unavailable. Nothing was compiled, and your text is kept here."

/**
 * Opens the page with the bundled cards and returns the list that collects
 * what the page logs as an error. The tests reload, so storage is cleared
 * once by hand and not by an init script.
 */
async function open(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
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

/** Fills localStorage until not one more character fits; returns the number of filler keys. */
async function fillStorage(page: Page): Promise<number> {
  return page.evaluate(() => {
    let chunk = 1 << 20
    let keys = 0
    while (chunk >= 1) {
      try {
        localStorage.setItem(`filler.${String(keys)}`, 'x'.repeat(chunk))
        keys += 1
      } catch {
        chunk = Math.floor(chunk / 2)
      }
    }
    return keys
  })
}

async function emptyFiller(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('filler.')) localStorage.removeItem(key)
    }
  })
}

test('with the browser storage full, a Commit and a Save say they were not saved, keep what was typed, and a reload shows the same card', async ({ page }) => {
  const errors = await open(page)
  await flipTo(page, 'back')
  const description = await page.getByTestId('description-input').inputValue()
  expect(await fillStorage(page)).toBeGreaterThan(0)

  // Commit: refused by localStorage. The message, the draft kept, the stored script as it was.
  await page.getByTestId('script-editor').fill(EDITED)
  await page.getByTestId('commit-script').click()
  await expect(page.getByTestId('commit-error')).toBeVisible()
  await expect(page.getByTestId('commit-error')).toHaveText(COMMIT_NOT_SAVED)
  await expect(page.getByTestId('parse-error')).toBeHidden()
  await expect(page.getByTestId('script-editor')).toHaveValue(EDITED)
  await expect(page.getByTestId('stored-script')).toHaveText(HELLO)
  await expect(page.getByTestId('script-origin')).toHaveText('bundled example')

  // Save: the description is refused, so nothing is compiled and the text stays in the input.
  await page.getByTestId('description-input').fill(TYPED)
  await page.getByTestId('save-description').click()
  await expect(page.getByTestId('save-description')).toBeEnabled()
  await expect(page.getByTestId('compile-error')).toHaveText(DESCRIPTION_NOT_SAVED)
  await expect(page.getByTestId('description-input')).toHaveValue(TYPED)
  await expect(page.getByTestId('stored-script')).toHaveText(HELLO)

  // The front still shows what the stored script wrote.
  await flipTo(page, 'front')
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await expect(page.getByTestId('status-line')).toHaveText('')

  // What the page shows is what storage holds: a reload changes nothing.
  const stored = await page.evaluate(() => {
    const cards = JSON.parse(localStorage.getItem('hcr.cards.v1') ?? '[]') as Array<{ script: string; description: string }>
    return { script: cards[0]?.script, description: cards[0]?.description }
  })
  expect(stored).toEqual({ script: HELLO, description })
  await page.reload()
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await flipTo(page, 'back')
  await expect(page.getByTestId('stored-script')).toHaveText(HELLO)
  await expect(page.getByTestId('description-input')).toHaveValue(description)
  await expect(page.getByTestId('commit-error')).toBeHidden()

  // With room again the same Commit is stored, runs, and survives a reload.
  await emptyFiller(page)
  await page.getByTestId('script-editor').fill(EDITED)
  await page.getByTestId('commit-script').click()
  await expect(page.getByTestId('commit-error')).toBeHidden()
  await expect(page.getByTestId('stored-script')).toHaveText(EDITED)
  await page.reload()
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello from a browser with no room left, Kiro!')

  expect(errors).toEqual([])
})

test('a Save that is still compiling when a Commit is made does not overwrite it: the panel says the card changed, and a reload shows the committed script', async ({ page }) => {
  const errors = await open(page)
  await flipTo(page, 'back')

  // Hold back the SHA-256 the compile service awaits before it answers; the test lets it go later.
  await page.evaluate(() => {
    const subtle = crypto.subtle
    const digest = subtle.digest.bind(subtle)
    const gate = new Promise<void>((resolve) => {
      ;(window as unknown as { letCompileAnswer: () => void }).letCompileAnswer = resolve
    })
    subtle.digest = async (algorithm, data) => {
      await gate
      return digest(algorithm, data)
    }
  })

  // Save the bundled description: offline it compiles to the bundled script, once the hash arrives.
  await page.getByTestId('save-description').click()
  await expect(page.getByTestId('compile-status')).toHaveText('Compiling…')
  await expect(page.getByTestId('save-description')).toBeDisabled()

  // Meanwhile a Commit by hand.
  await page.getByTestId('script-editor').fill(EDITED)
  await page.getByTestId('commit-script').click()
  await expect(page.getByTestId('stored-script')).toHaveText(EDITED)
  await expect(page.getByTestId('save-description')).toBeDisabled()

  // The compile answers. Its script is not stored.
  await page.evaluate(() => {
    ;(window as unknown as { letCompileAnswer: () => void }).letCompileAnswer()
  })
  await expect(page.getByTestId('save-description')).toBeEnabled()
  await expect(page.getByTestId('compile-error')).toHaveText(SAVE_OVERTAKEN)
  await expect(page.getByTestId('stored-script')).toHaveText(EDITED)
  await expect(page.getByTestId('script-origin')).toHaveText(/^edited by hand at /)
  await flipTo(page, 'front')
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello from a browser with no room left, Kiro!')

  await page.reload()
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello from a browser with no room left, Kiro!')
  await flipTo(page, 'back')
  await expect(page.getByTestId('stored-script')).toHaveText(EDITED)
  await expect(page.getByTestId('compile-error')).toBeHidden()

  // Pressing Save again, as the message says, compiles and stores the bundled script.
  await page.getByTestId('save-description').click()
  await expect(page.getByTestId('stored-script')).toHaveText(HELLO)
  await expect(page.getByTestId('script-origin')).toHaveText(/^compiled offline at /)
  await expect(page.getByTestId('compile-error')).toBeHidden()

  expect(errors).toEqual([])
})
