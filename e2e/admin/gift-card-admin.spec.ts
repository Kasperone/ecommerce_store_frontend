// Admin gift cards (`/admin/gift-cards`, `/admin/gift-cards/[id]`). The
// *money* legs are already covered — `checkout/gift-card.spec.ts` (tender,
// partial + full cover) and `checkout/gift-card-purchase.spec.ts` (buy → pay →
// issue → redeem). What was unspecced is the back-office surface that mints and
// corrects stored value by hand.
//
// A gift card is bearer money, so two properties matter more than the CRUD:
//
//   1. **The plaintext code exists exactly once** — in the 201 issue body, shown
//      in a non-dismissible panel. The row stores a sha256 hash + last4, so an
//      admin who loses the code cannot recover it from the database.
//   2. **The ledger is the audit trail.** Every balance movement appends an
//      append-only `gift_card_entries` row, and a REJECTED movement must leave
//      no trace at all — the overdraw guard is the one place a naive
//      implementation writes the entry before validating the balance.
//
// Two tests:
//   1. issue through the UI → the code panel → the ledger through an adjustment
//      up, an adjustment that overdraws (400 `gift_card_balance_negative`), and
//      a status flip. The overdraw leg asserts the balance AND the entry count
//      are both unchanged.
//   2. the list filters (status / currency / search by last4 and by recipient
//      email), each narrowing asserted with a control row that must remain.
//
// ⚠️ Money columns are `numeric(12,2)`, which `pg` returns as STRINGS to keep
// them exact — assert `'125.00'`, never `125`.
//
// ⚠️ There is no admin DELETE route (cards are permanent by design), so cleanup
// is a pg purge keyed on a run-owned recipient-email prefix. It also runs at
// test START: a test-timeout kill never reaches `finally`.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { selectOption } from '../helpers/nuxtUiSelect'
import { setUInputNumber } from '../helpers/uinputnumber'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

function field(scope: Page | Locator, label: string): Locator {
  return scope.getByLabel(new RegExp(`^${label}\\s*\\*?$`))
}

test.describe('Admin gift cards', () => {
  test('issue → reveal the code once → adjust the balance → refuse an overdraw', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const emailPrefix = `gc-issue-${runId}`
    const recipient = `${emailPrefix}@e2e.example.com`
    let cardId: number | null = null

    try {
      await api.purgeGiftCardsByRecipientPrefix(emailPrefix)
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([admin.refreshCookie])

      await page.goto('/admin/gift-cards')
      await expect(page).toHaveURL(/\/admin\/gift-cards/, { timeout: 60_000 })

      const dialog = page.getByRole('dialog')

      // ---- issue ----
      const issueBtn = page.getByTestId('gift-card-issue-button')
      await expect(issueBtn).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await issueBtn.click()
        await expect(dialog.getByTestId('gift-card-initial-value')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 90_000 })

      await setUInputNumber(dialog.getByTestId('gift-card-initial-value'), 100)
      // EUR, not the default USD — picking the default would prove nothing
      // about the select's binding (the FE #334 reason).
      await selectOption(page, dialog, 'Currency', 'EUR')
      await field(dialog, 'Recipient email').fill(recipient)
      await field(dialog, 'Internal note').fill(`issued by e2e ${runId}`)
      await dialog.getByRole('button', { name: 'Issue', exact: true }).click()

      // ---- the code panel: the only place the plaintext ever appears ----
      const codePanel = page.getByTestId('gift-card-code-panel')
      await expect(codePanel).toBeVisible({ timeout: 30_000 })
      const code = (await page.getByTestId('gift-card-code').innerText()).trim()
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
      await expect(codePanel).toContainText('stored hashed')
      await expect(codePanel).toContainText(recipient)

      const issued = await api.getGiftCardIdByRecipient(recipient)
      expect(issued).not.toBeNull()
      cardId = issued
      const row = await api.getGiftCardRow(cardId!)
      expect(row!.currency).toBe('EUR')
      expect(row!.initial_value).toBe('100.00')
      expect(row!.balance).toBe('100.00')
      expect(row!.status).toBe('active')
      expect(row!.last4).toBe(code.slice(-4))
      // The card is bearer money: the plaintext must not be recoverable.
      expect(row!.code_hash).not.toContain(code)
      expect(row!.code_hash).toHaveLength(64)

      // Issuing is itself a ledger movement.
      const afterIssue = await api.getGiftCardEntryRows(cardId!)
      expect(afterIssue).toHaveLength(1)
      expect(afterIssue[0].kind).toBe('issue')
      expect(afterIssue[0].amount).toBe('100.00')
      expect(afterIssue[0].balance_after).toBe('100.00')

      await page.getByTestId('gift-card-code-done').click()
      await expect(codePanel).toBeHidden({ timeout: 20_000 })

      // ---- open the detail page through the list ----
      const listRow = page.locator('tbody tr').filter({ hasText: recipient })
      await expect(listRow).toHaveCount(1, { timeout: 30_000 })
      await listRow.getByRole('link', { name: 'Details' }).click()
      await expect(page).toHaveURL(new RegExp(`/admin/gift-cards/${cardId}`), { timeout: 120_000 })

      const ledgerEntries = page.locator('[data-testid^="gift-card-entry-"]')
      await expect(ledgerEntries).toHaveCount(1, { timeout: 60_000 })

      // ---- adjust up ----
      await expect(async () => {
        await page.getByTestId('gift-card-adjust').click()
        await expect(dialog.getByTestId('gift-card-adjust-amount')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })
      await setUInputNumber(dialog.getByTestId('gift-card-adjust-amount'), 25)
      await dialog.getByTestId('gift-card-adjust-note').fill('e2e top up')
      await dialog.getByTestId('gift-card-adjust-confirm').click()

      await expect(ledgerEntries).toHaveCount(2, { timeout: 30_000 })
      const afterTopUp = await api.getGiftCardEntryRows(cardId!)
      expect(afterTopUp).toHaveLength(2)
      expect(afterTopUp[1].kind).toBe('adjust')
      expect(afterTopUp[1].amount).toBe('25.00')
      expect(afterTopUp[1].balance_after).toBe('125.00')
      expect(afterTopUp[1].note).toBe('e2e top up')
      expect((await api.getGiftCardRow(cardId!))!.balance).toBe('125.00')

      // ---- an overdraw is refused, and leaves NO ledger row ----
      await expect(async () => {
        await page.getByTestId('gift-card-adjust').click()
        await expect(dialog.getByTestId('gift-card-adjust-amount')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })
      await setUInputNumber(dialog.getByTestId('gift-card-adjust-amount'), -500)
      await dialog.getByTestId('gift-card-adjust-confirm').click()

      // The dialog stays open and explains itself rather than closing silently.
      await expect(dialog).toContainText('below zero', { timeout: 30_000 })
      const afterOverdraw = await api.getGiftCardEntryRows(cardId!)
      expect(afterOverdraw).toHaveLength(2)
      expect((await api.getGiftCardRow(cardId!))!.balance).toBe('125.00')

      await page.keyboard.press('Escape')
      await expect(dialog.getByTestId('gift-card-adjust-amount')).toBeHidden({ timeout: 20_000 })

      // ---- disabling is a management flip, NOT a movement ----
      await page.getByTestId('gift-card-toggle-status').click()
      await expect.poll(
        async () => (await api.getGiftCardRow(cardId!))!.status,
        { timeout: 30_000 },
      ).toBe('disabled')
      expect(await api.getGiftCardEntryRows(cardId!)).toHaveLength(2)
      expect((await api.getGiftCardRow(cardId!))!.balance).toBe('125.00')
      await expect(page.getByTestId('gift-card-status-badge')).toContainText('Disabled')
    }
    finally {
      await api.purgeGiftCardsByRecipientPrefix(emailPrefix)
      await api.dispose()
    }
  })

  test('list filters narrow by status, currency and search', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const emailPrefix = `gc-filter-${runId}`
    // `keeper` is the control: it must stay visible on the far side of EVERY
    // filter, so an empty table can never be mistaken for a working narrowing
    // (a Colada query-key change clears `data` and the table is briefly empty).
    const keeperEmail = `${emailPrefix}-keeper@e2e.example.com`
    const targetEmail = `${emailPrefix}-target@e2e.example.com`

    try {
      await api.purgeGiftCardsByRecipientPrefix(emailPrefix)
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([admin.refreshCookie])

      const keeper = await api.issueGiftCardAsAdmin(admin.accessToken, {
        initialValue: 50,
        currency: 'USD',
        recipientEmail: keeperEmail,
      })
      const target = await api.issueGiftCardAsAdmin(admin.accessToken, {
        initialValue: 75,
        currency: 'PLN',
        recipientEmail: targetEmail,
      })
      await api.setGiftCardStatus(admin.accessToken, target.id, 'disabled')

      await page.goto('/admin/gift-cards')
      await expect(page).toHaveURL(/\/admin\/gift-cards/, { timeout: 60_000 })

      const rows = page.locator('tbody tr')
      const search = field(page, 'Search')

      // Scope the table to this run's two cards (the email match is a
      // `contains`, so the shared prefix picks up exactly both).
      await expect(search).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await search.fill(emailPrefix)
        await expect(rows).toHaveCount(2, { timeout: 5_000 })
      }).toPass({ timeout: 60_000 })

      // ---- status ----
      await selectOption(page, page, 'Status', 'Active')
      await expect(rows).toHaveCount(1, { timeout: 30_000 })
      await expect(rows.filter({ hasText: keeperEmail })).toHaveCount(1)
      // Active → Disabled is one row → one row, so a count asserted first passes
      // on the stale Active row before the refetch: pin the swap by content.
      await selectOption(page, page, 'Status', 'Disabled')
      await expect(rows.filter({ hasText: targetEmail })).toHaveCount(1, { timeout: 30_000 })
      await expect(rows).toHaveCount(1)
      await selectOption(page, page, 'Status', 'All')
      await expect(rows).toHaveCount(2, { timeout: 30_000 })

      // ---- currency ----
      await selectOption(page, page, 'Currency', 'USD')
      await expect(rows).toHaveCount(1, { timeout: 30_000 })
      await expect(rows.filter({ hasText: keeperEmail })).toHaveCount(1)
      await selectOption(page, page, 'Currency', 'All currencies')
      await expect(rows).toHaveCount(2, { timeout: 30_000 })

      // ---- search by last4: an EXACT match, unlike the email `contains` ----
      await search.fill(target.last4)
      await expect(rows).toHaveCount(1, { timeout: 30_000 })
      await expect(rows.filter({ hasText: targetEmail })).toHaveCount(1)

      // ...and the keeper's own last4 brings back the other card, proving the
      // narrowing above followed the argument rather than emptying the table.
      // (One row → one row again: content first, as with Active → Disabled.)
      await search.fill(keeper.last4)
      await expect(rows.filter({ hasText: keeperEmail })).toHaveCount(1, { timeout: 30_000 })
      await expect(rows).toHaveCount(1)
    }
    finally {
      await api.purgeGiftCardsByRecipientPrefix(emailPrefix)
      await api.dispose()
    }
  })
})
