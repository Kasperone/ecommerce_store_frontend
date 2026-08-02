// The token half of the two email-driven auth flows — the part that actually
// changes account state, and the part neither existing spec reaches.
//
// `auth/register.spec.ts` stops at "we sent you an email" and
// `auth/password-reset.spec.ts` stops at the success card, so everything after
// the link is clicked was unproven: whether verification actually unlocks
// login, whether a reset actually rotates the password, and whether either
// token can be replayed.
//
// The token stands in for the inbox (e2e runs with email disabled), and the two
// are deliberately obtained in DIFFERENT ways, because the backend stores them
// differently:
//
//   * `verification_tokens.token` is **plaintext** → read it from pg.
//   * `users.password_reset_token_hash` is **sha256(token)** and only the email
//     ever carries the plaintext → the spec mints the pair itself.
//
// If a future change starts hashing verification tokens too, `getVerificationToken`
// returns something that fails to verify, and test 1 fails loudly rather than
// silently testing nothing.
//
// Two tests, each ending where the user actually cares: being able to log in.
import { expect, test, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(180_000)

/**
 * Log in and wait for the attempt to actually SETTLE — either the app
 * navigates away from /login, or the form shows its error alert.
 *
 * ⚠️ Both matter, and a plain click covers neither. The login page is
 * server-rendered, so a click can land before Vue binds the submit handler and
 * is silently swallowed: the positive cases then time out on the URL, and — far
 * worse — the negative cases ("still on /login") PASS without the login ever
 * having been attempted. Retrying until one of the two outcomes appears makes a
 * refused login a positive observation rather than an absence.
 */
async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  const emailField = page.getByLabel('Email', { exact: true })
  await expect(emailField).toBeVisible({ timeout: 60_000 })

  await expect(async () => {
    await emailField.fill(email)
    await page.getByLabel(/^password$/i).fill(password)
    await page.getByRole('button', { name: 'Login', exact: true }).click({ timeout: 5_000 })

    const settled = await Promise.race([
      page.waitForURL(/\/account/, { timeout: 5_000 }).then(() => 'navigated').catch(() => null),
      page.getByRole('alert').first().waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => 'rejected').catch(() => null),
    ])
    expect(settled).not.toBeNull()
  }).toPass({ timeout: 90_000 })
}

test.describe('Email-token completion', () => {
  test('verification link unlocks a registered account, and cannot be replayed', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()

    try {
      // Registered but NOT marked verified — the state every real signup lands
      // in. (Sibling specs call `markVerified`, which skips exactly this leg.)
      await api.register(user)
      expect((await api.getUserAuthRow(user.email))?.is_verified).toBe(false)

      // Unverified login is refused. This is the reason the flow matters, so
      // assert it before proving the fix rather than trusting the 403 exists.
      // The alert (not the URL) is the assertion — see `submitLogin`.
      await submitLogin(page, user.email, user.password)
      await expect(page.getByRole('alert').first()).toBeVisible()
      await expect(page).toHaveURL(/\/login/)

      const token = await api.getVerificationToken(user.email)
      expect(token).not.toBeNull()

      await page.goto(`/verify-email?token=${token}`)
      await expect(page.getByText('Email Verified!')).toBeVisible({ timeout: 60_000 })

      // pg is the truth: the flag flipped AND the token row is gone, which is
      // what makes the link one-time rather than merely idempotent.
      await expect.poll(
        async () => (await api.getUserAuthRow(user.email))?.is_verified,
        { timeout: 20_000 },
      ).toBe(true)
      expect(await api.getVerificationToken(user.email)).toBeNull()

      // The whole point: the account is now usable.
      await submitLogin(page, user.email, user.password)
      await expect(page).toHaveURL(/\/account/, { timeout: 60_000 })

      // Replaying the consumed link fails rather than silently re-verifying.
      await page.goto(`/verify-email?token=${token}`)
      await expect(page.getByText('Verification Failed')).toBeVisible({ timeout: 60_000 })
    }
    finally {
      await api.dispose()
    }
  })

  // ⚠️ FIXME — blocked on a real defect, not on this spec. The confirm form
  // will not submit: the field visibly holds the password and the strength
  // meter reads "Very strong", yet Zod reports "Must be at least 8 characters"
  // and NO request is made. The form model is empty while the DOM is full.
  // Measurements + the two hypotheses already ruled out (fill-vs-keystrokes,
  // and `initial` being a computed bound as `:state`) are in
  // `plans/test/to-fix/2026-08-02-password-reset-confirm-form-will-not-submit-frontend.md`.
  // Everything below is verified working EXCEPT the submit: the backend
  // rotates correctly over curl, and `mintPasswordResetToken` arms the token.
  // Delete this `fixme` the moment the form submits.
  test.fixme('reset link rotates the password: new one works, old one is dead', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    const newPassword = 'RotatedPass!2'

    try {
      await api.register(user)
      await api.markVerified(user.email)
      const before = await api.getUserAuthRow(user.email)
      expect(before?.password_reset_token_hash).toBeNull()

      const token = await api.mintPasswordResetToken(user.email)
      // Only the hash is stored — a spec that could read the token back would
      // be proving the opposite of what this flow requires.
      const armed = await api.getUserAuthRow(user.email)
      expect(armed?.password_reset_token_hash).not.toBeNull()
      expect(armed?.password_reset_token_hash).not.toBe(token)

      await page.goto(`/password-reset/${token}`)
      const newField = page.getByLabel('New password', { exact: true })
      await expect(newField).toBeVisible({ timeout: 60_000 })
      // ⚠️ This form clears itself once, ~1 s after load, and everything about
      // the resulting failure points at the wrong thing. Measured: type 3
      // characters and the input holds 3; wait 1.2 s without touching it and it
      // holds 0. Anything typed before that beat is gone from the form model
      // while the DOM may still show it — Zod then validates an empty string,
      // reports "Must be at least 8 characters" under a field containing 13,
      // blocks the submit, and **no request is made at all**. It reads exactly
      // like a dead button. (Same family as the documented SSR-fill-races-
      // hydration gotcha; `fill()` is worse still, since it never dispatches
      // the per-key events the model needs.)
      //
      // So: real keystrokes, then wait out the reset window, then assert the
      // values SURVIVED before clicking. The retry re-types if they did not.
      const confirmField = page.getByLabel('Confirm new password', { exact: true })
      await expect(async () => {
        await newField.fill('')
        await newField.pressSequentially(newPassword)
        await confirmField.fill('')
        await confirmField.pressSequentially(newPassword)

        await page.waitForTimeout(1_500)
        await expect(newField).toHaveValue(newPassword)
        await expect(confirmField).toHaveValue(newPassword)

        await page.getByRole('button', { name: 'Update password' }).click({ timeout: 5_000 })
        await expect(page.getByText(/Password updated/)).toBeVisible({ timeout: 5_000 })
      }).toPass({ timeout: 120_000 })

      // Consumed: the hash is cleared, so the same link cannot be replayed, and
      // `password_changed_at` moves — that is what invalidates access tokens
      // already issued elsewhere.
      await expect.poll(
        async () => (await api.getUserAuthRow(user.email))?.password_reset_token_hash,
        { timeout: 20_000 },
      ).toBeNull()
      const after = await api.getUserAuthRow(user.email)
      expect(after?.password_changed_at).not.toBeNull()
      expect(after!.password_changed_at!.getTime())
        .toBeGreaterThan(before?.password_changed_at?.getTime() ?? 0)

      // The rotation is real in both directions.
      await submitLogin(page, user.email, newPassword)
      await expect(page).toHaveURL(/\/account/, { timeout: 60_000 })

      await page.context().clearCookies()
      await submitLogin(page, user.email, user.password)
      await expect(page.getByRole('alert').first()).toBeVisible()
      await expect(page).toHaveURL(/\/login/)
    }
    finally {
      await api.dispose()
    }
  })
})
