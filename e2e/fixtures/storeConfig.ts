import { test } from '@playwright/test'
import { ApiClient } from './apiClient'
import { KNOWN_ADMIN } from './testUser'

/**
 * Snapshot the given `store_config` keys before a spec file runs and put them
 * back after it, whatever its tests did to them.
 *
 * `store_config` is a **shared singleton**: unlike per-run products, coupons or
 * users, a spec that flips a flag on it changes the app every *later* spec sees
 * in that database. That is how `checkout/coupon.spec.ts` broke (FE #373) — with
 * `gift_cards_enabled` left on by a gift-card spec, checkout grew a second
 * button named "Apply" and a role locator became ambiguous. The suite only
 * stayed green because CI starts from a fresh DB *and* the specs happened to
 * sort in a forgiving order; neither is a property anyone maintains.
 *
 * Call this at the top level of a spec file that writes store config:
 *
 * ```ts
 * restoreStoreConfigAfterAll(['gift_cards_enabled'])
 * ```
 *
 * Deliberate choices:
 *
 * - **`beforeAll`/`afterAll`, not a `finally` in the test.** The flip often
 *   happens inside a shared setup helper; if that helper throws after writing
 *   the config, a test-local `finally` never learns it has something to undo.
 *   Hooks run regardless of how the tests exited.
 * - **Restore the captured value, not a hardcoded `false`.** The right end state
 *   is "however this database was before", which survives the defaults changing
 *   or a developer running against a store that legitimately has the feature on.
 * - Safe under this repo's `workers: 1` + `fullyParallel: false`. With real
 *   parallelism the restore would race a concurrent file that needs the flag on,
 *   so revisit this if that config ever changes.
 */
export function restoreStoreConfigAfterAll(keys: readonly string[]): void {
  let snapshot: Record<string, unknown> | null = null

  test.beforeAll(async () => {
    const api = await ApiClient.create()
    try {
      const { accessToken } = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      const config = await api.getStoreConfig(accessToken)
      snapshot = Object.fromEntries(keys.map(key => [key, config[key]]))
    }
    finally {
      await api.dispose()
    }
  })

  test.afterAll(async () => {
    if (!snapshot) return
    const api = await ApiClient.create()
    try {
      const { accessToken } = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await api.updateStoreConfig(accessToken, snapshot)
    }
    finally {
      await api.dispose()
    }
  })
}
