/* global console, document, localStorage */
// Drives docs/demo.md step by step against a running `npm run preview`
// (http://localhost:4173/). Usage: node scripts/demo-run.mjs
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:4173/'
const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
const requests = []
const t = (id) => page.getByTestId(id)
const expectText = async (id, text) => {
  const actual = await t(id).textContent()
  if (!actual.includes(text)) throw new Error(`step expected "${text}" in ${id}, got "${actual}"`)
}
const expectValue = async (id, value) => {
  const actual = await t(id).inputValue()
  if (actual !== value) throw new Error(`step expected ${id} to read "${value}", got "${actual}"`)
}
const ok = async () => { await t('answer-ok').click(); await t('answer-dialog').waitFor({ state: 'detached' }) }
const dialog = async (text) => { await t('answer-dialog').waitFor(); await expectText('answer-dialog', text) }

// Step 0
await page.goto(BASE)
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('hcr.')) localStorage.removeItem(k) })
await page.reload()
await page.waitForLoadState('load')
page.on('request', (r) => requests.push(r.url()))
await expectText('card-name', 'Hello'); await expectText('card-position', 'Card 1 of 6'); await expectValue('field-greeting', 'Hello, world!')
console.log('step 0 ok')
// Step 1
await t('flip').click(); await expectText('stored-script', 'on openCard'); console.log('step 1 ok')
// Step 2
await t('flip').click(); await t('card-next').click(); await expectText('card-name', 'Counter')
for (let i = 0; i < 3; i++) await t('button-increment').click()
await expectValue('field-count', '3'); console.log('step 2 ok')
// Step 3
await t('card-next').click(); await expectText('card-name', 'Date stamp')
if (await t('field-stamp').isVisible()) throw new Error('stamp field should be hidden')
await t('button-stamp').click(); if (!(await t('field-stamp').inputValue()).match(/^\d+\/\d+\/\d\d$/)) throw new Error('no date')
await t('card-next').click(); await expectText('card-name', 'Greeter')
await t('button-greet').click(); await dialog('Please enter your name.'); await ok()
await t('field-name').fill('Ada'); await t('button-greet').click(); await dialog('Hello, Ada!'); await ok(); console.log('step 3 ok')
// Step 4
await t('card-next').click(); await t('button-go').click(); await expectValue('field-list', '10\n9\n8\n7\n6\n5\n4\n3\n2\n1\nLiftoff!')
await t('card-next').click(); await expectText('card-name', 'Quiz'); await t('field-answer').fill('4'); await t('button-check').click()
await dialog('Correct!'); await expectText('card-position', 'Card 6 of 6'); await ok(); await expectText('card-position', 'Card 2 of 6')
for (let i = 0; i < 4; i++) await t('card-next').click()
await expectText('card-name', 'Quiz'); console.log('step 4 ok')
// Step 5
await t('flip').click(); await t('chip-counter').click(); await t('save-description').click()
await page.waitForFunction(() => document.querySelector('[data-testid="script-origin"]')?.textContent?.startsWith('compiled offline at'))
await expectText('stored-script', 'if the target is "Increment" then')
await t('flip').click(); await expectText('status-line', 'field "count" does not exist')
await t('flip').click(); await t('chip-quiz').click(); await t('save-description').click()
await page.waitForFunction(() => document.querySelector('[data-testid="stored-script"]')?.textContent?.includes('if field "answer" = 4 then'))
await t('flip').click(); if ((await t('status-line').textContent()) !== '') throw new Error('status should be clear')
console.log('step 5 ok')
// Step 6
await t('flip').click()
const draft = await t('script-editor').inputValue()
await t('script-editor').fill(draft.replace('if field "answer" = 4 then', 'if field "answer" = 5 then'))
await t('commit-script').click(); if (await t('parse-error').isVisible()) throw new Error('unexpected parse error')
await t('flip').click(); await t('field-answer').fill('5'); await t('button-check').click(); await dialog('Correct!'); await ok()
await expectText('card-position', 'Card 2 of 6'); for (let i = 0; i < 4; i++) await t('card-next').click(); console.log('step 6 ok')
// Step 7
await t('flip').click()
const good = await t('script-editor').inputValue()
const broken = good.replace('      answer "Try again."\n    end if\n', '      answer "Try again."\n')
if (broken === good) throw new Error('could not break the script')
await t('script-editor').fill(broken); await t('commit-script').click()
if (!(await t('parse-error').isVisible())) throw new Error('parse error should show')
await expectText('stored-script', 'if field "answer" = 5 then')
await t('flip').click(); await t('field-answer').fill('5'); await t('button-check').click(); await dialog('Correct!'); await ok()
for (let i = 0; i < 4; i++) await t('card-next').click(); console.log('step 7 ok')
// Step 8
await t('flip').click(); await t('description-input').fill('Make the card purple.'); await t('save-description').click()
await t('compile-error').waitFor(); await expectText('compile-error', 'The offline compiler only knows the six bundled descriptions.')
console.log('step 8 ok')
// Step 9
await t('settings-open').click(); await t('settings-panel').waitFor(); await t('provider-anthropic').isVisible(); await t('settings-close').click()
console.log('step 9 ok')
const after = requests.filter((u) => !u.endsWith('/') && !u.includes('/index.html'))
if (after.length > 0) throw new Error(`requests after load: ${after.join(', ')}`)
console.log('network: zero requests after load')
await browser.close()
