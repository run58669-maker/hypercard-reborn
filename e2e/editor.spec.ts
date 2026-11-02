import { expect, test } from '@playwright/test'

const EDITED = 'on openCard\n  put "Hello, Kiro!" into field "greeting"\nend openCard\n'
const BROKEN = 'on openCard\n  put "Hello, Kiro!" into field "greeting"\nend mouseUp\n'

// This spec reloads the page to prove persistence, so it clears localStorage
// once by hand instead of with an init script (which would run again on the
// reload and wipe the edit).
test('edit, commit, re-run, persist, and keep the last valid script on a parse error, with no network', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
  await page.reload()
  await page.waitForLoadState('load')
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, world!')
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'back')
  await page.getByTestId('script-editor').fill(EDITED)
  await page.getByTestId('commit-script').click()
  await expect(page.getByTestId('parse-error')).toBeHidden()
  await expect(page.getByTestId('stored-script')).toHaveText(EDITED)
  await expect(page.getByTestId('script-origin')).toContainText('edited by hand at')

  // Flip back: the card already re-ran, without reloading.
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('card')).toHaveAttribute('data-face', 'front')
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, Kiro!')

  // Persisted across a reload.
  await page.reload()
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, Kiro!')
  page.on('request', (request) => requests.push(request.url()))

  // A syntax error: the panel shows next to the editor, the front face keeps the last valid result.
  await page.getByTestId('flip').click()
  await page.getByTestId('script-editor').fill(BROKEN)
  await page.getByTestId('script-editor').press('Control+Enter')
  await expect(page.getByTestId('parse-error')).toBeVisible()
  await expect(page.getByTestId('parse-error')).toContainText('Line 3, column 5: expected "end openCard", found "end mouseUp"')
  await expect(page.getByTestId('script-editor')).toHaveValue(BROKEN)
  await expect(page.getByTestId('stored-script')).toHaveText(EDITED)
  await page.getByTestId('flip').click()
  await expect(page.getByTestId('field-greeting')).toHaveValue('Hello, Kiro!')

  const afterLoad = requests.filter((url) => !url.endsWith('/') && !url.includes('/index.html'))
  expect(afterLoad).toEqual([])
})
