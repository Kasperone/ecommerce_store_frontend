import { expect, test } from '@playwright/test'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// Not @mobile: at 412px the cookie-consent banner occupies the lower viewport
// and Playwright's scroll-into-view then parks the submit button under the
// sticky header, so the click is intercepted before the form is reached. That
// is a fixture problem (the banner needs dismissing for mobile runs), not a
// bug in registration — retag once the mobile project seeds a `cookie_consent`
// cookie. See notes/plans/test/pending/ for the follow-up.
test('register happy path → redirects to /verify-email-sent', async ({ page }) => {
  const user = randomEphemeralUser()

  await page.goto('/sign-up')
  await page.waitForLoadState('networkidle')

  await page.getByLabel(/first name/i).fill(user.firstName)
  await page.getByLabel(/last name/i).fill(user.lastName)
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel(/^password$/i).fill(user.password)
  await page.getByLabel(/confirm password/i).fill(user.password)

  await page.getByRole('button', { name: /continue/i }).click()

  // Lands on /verify-email-sent carrying the email. Assert the decoded query
  // value, not an exact encoded URL — the redirect is built with localePath's
  // route-object form, so Vue Router stringifies the query (leaving `@`
  // unescaped) rather than us hand-encoding it.
  await expect(page).toHaveURL(/\/verify-email-sent\?email=/)
  expect(new URL(page.url()).searchParams.get('email')).toBe(user.email)
})

// Regression guard: the Personal/Business switch on /sign-up is the ONLY way
// into B2B self-signup. Server-rendered, that `UTabs` never hydrated its
// interactivity — correct markup, correct ARIA, no console error, but the
// trigger emitted nothing, so the tab was completely dead and the business
// form unreachable. The tab bar is now `<ClientOnly>`; this asserts a real
// panel swap, not just that the tab is clickable.
test('sign-up: the Business tab actually reveals the business form', async ({ page }) => {
  await page.goto('/sign-up')

  const businessTab = page.getByRole('tab', { name: /business/i })
  await expect(businessTab).toBeVisible()
  await expect(page.getByLabel(/company name/i)).toBeHidden()

  await businessTab.click()

  await expect(businessTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel(/company name/i)).toBeVisible()
})
