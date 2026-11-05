import { expect, test } from '@playwright/test'

// Every spec starts from a clean localStorage so seeding is exercised each
// time (testing.md). The smoke spec only checks that the bundle serves.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hcr.')) localStorage.removeItem(key)
    }
  })
})

test('the app loads and shows its title', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('HyperCard Reborn')).toBeVisible()
})
