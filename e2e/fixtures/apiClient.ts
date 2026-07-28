import { createHash, randomBytes } from 'node:crypto'
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { Client as PgClient } from 'pg'
import type { TestUser } from './testUser'

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'
const DB_URL = process.env.E2E_DB_URL

if (!DB_URL) {
  throw new Error('E2E_DB_URL must be set (Postgres connection string for ecommerce_e2e)')
}

export class ApiClient {
  private constructor(
    private http: APIRequestContext,
    private pg: PgClient,
  ) {}

  static async create(): Promise<ApiClient> {
    const http = await playwrightRequest.newContext({ baseURL: BACKEND_URL })
    const pg = new PgClient({ connectionString: DB_URL })
    await pg.connect()
    return new ApiClient(http, pg)
  }

  async dispose(): Promise<void> {
    await this.http.dispose()
    await this.pg.end()
  }

  async register(user: TestUser): Promise<void> {
    const res = await this.http.post('/api/v1/auth/register', {
      data: {
        email: user.email,
        password: user.password,
        first_name: user.firstName,
        last_name: user.lastName,
      },
    })
    if (!res.ok()) {
      throw new Error(`register failed: ${res.status()} ${await res.text()}`)
    }
  }

  async loginViaApi(email: string, password: string): Promise<{
    accessToken: string
    refreshCookie: { name: string, value: string, domain: string, path: string, expires: number, httpOnly: boolean, secure: boolean, sameSite: 'Strict' | 'Lax' | 'None' }
  }> {
    const form = new URLSearchParams({ username: email, password })
    const res = await this.http.post('/api/v1/auth/login', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      data: form.toString(),
    })
    if (!res.ok()) {
      throw new Error(`login failed: ${res.status()} ${await res.text()}`)
    }
    const body = await res.json() as { access_token: string, token_type: string }
    const setCookie = res.headers()['set-cookie'] ?? ''
    const refreshCookie = parseRefreshCookie(setCookie)
    return { accessToken: body.access_token, refreshCookie }
  }

  async markVerified(email: string): Promise<void> {
    await this.pg.query(
      `UPDATE users
         SET is_verified = true, failed_login_attempts = 0, locked_until = NULL
       WHERE email = $1`,
      [email],
    )
  }

  async promoteAdmin(email: string): Promise<void> {
    // is_owner mirrors the A1 migration backfill: a seeded admin is an owner
    // (implicitly every capability), so capability-gated write routes and the
    // full admin sidebar are available in E2E.
    await this.pg.query(
      `UPDATE users SET role = 'ADMIN', is_owner = true WHERE email = $1`,
      [email],
    )
  }

  /**
   * Make a *scoped* staffer: role=ADMIN (coarse "any staff" gate) but
   * is_owner=false with an explicit capability subset. Unlike an owner (implicit
   * every capability), `can(cap)` for such a user is exactly `caps.includes(cap)`
   * — which is what filters the admin sidebar (`sidebarMenu.ts`). Seeding via pg
   * because the PATCH /admin/staff route requires the *acting* admin to be an
   * owner to grant capabilities.
   */
  async makeScopedStaff(email: string, capabilities: string[]): Promise<void> {
    await this.pg.query(
      `UPDATE users SET role = 'ADMIN', is_owner = false, capabilities = $2 WHERE email = $1`,
      [email, capabilities],
    )
  }

  async getMe(accessToken: string): Promise<{
    first_name: string
    last_name: string
    phone: string | null
  }> {
    const res = await this.http.get('/api/v1/auth/me', {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`getMe failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json() as { first_name: string, last_name: string, phone: string | null }
  }

  /** The integer user id for an email (via pg) — the price-list spec needs it to
   * set a company's primary contact. */
  async userIdByEmail(email: string): Promise<number> {
    const res = await this.pg.query<{ id: number }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    )
    if (res.rows.length === 0) throw new Error(`userIdByEmail: no user for ${email}`)
    return res.rows[0]!.id
  }

  async truncateAuthTables(): Promise<void> {
    await this.pg.query('TRUNCATE TABLE users, refresh_tokens, verification_tokens RESTART IDENTITY CASCADE')
  }

  async truncateEphemeralAuthState(): Promise<void> {
    // Wipe per-run state without touching the seeded users — keeps the
    // /auth/register rate-limit budget intact across local runs.
    await this.pg.query('TRUNCATE TABLE refresh_tokens, verification_tokens RESTART IDENTITY CASCADE')
  }

  async userExists(email: string): Promise<boolean> {
    const res = await this.pg.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) AS exists',
      [email],
    )
    return res.rows[0]?.exists ?? false
  }

  async lockUser(email: string): Promise<void> {
    // Direct SQL — bypassing /auth/login because slowapi caps that endpoint
    // at 5/15min per IP-and-email, so the API path can't reach the threshold
    // of 10 failed attempts. The lockout test cares about the locked-out
    // *behavior* (correct password also fails when locked), not the counter
    // mechanism, which is covered by backend integration tests.
    await this.pg.query(
      `UPDATE users
         SET failed_login_attempts = 10,
             locked_until = (NOW() AT TIME ZONE 'UTC') + INTERVAL '30 minutes'
       WHERE email = $1`,
      [email],
    )
  }

  async getPasswordResetTokenHash(email: string): Promise<string | null> {
    const res = await this.pg.query<{ password_reset_token_hash: string | null }>(
      'SELECT password_reset_token_hash FROM users WHERE email = $1',
      [email],
    )
    return res.rows[0]?.password_reset_token_hash ?? null
  }

  async createProduct(
    accessToken: string,
    input: {
      name: string
      slug: string
      price_usd: number
      price_pln: number
      price_eur: number
      stock?: number
      category_id?: number | null
      // Assign a specific tax category (e.g. a REDUCED_5 / REDUCED_8 id from
      // taxCategoryIdByCode) to exercise the mixed-rate faktura decomposition.
      // Omit → the backend assigns the default (STANDARD, 23% in PL).
      tax_category_id?: number
      // Gift cards v2: a purchasable gift-card product (digital line — no
      // shipping, non-taxable; issues a stored-value card on payment).
      is_gift_card?: boolean
    },
  ): Promise<{ id: number }> {
    const body = {
      stock: 0,
      category_id: null,
      ...input,
    }
    const res = await this.http.post('/api/v1/products/', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: body,
    })
    if (!res.ok()) {
      throw new Error(`createProduct failed: ${res.status()} ${await res.text()}`)
    }
    const product = await res.json() as { id: number }
    return { id: product.id }
  }

  /**
   * Admin: PUT a partial product update. Used by the PL money-path spec to
   * seed an OMNIBUS price trail — each price change appends a price_history
   * row via the backend chokepoint, so a down-then-up sequence leaves a
   * lowest-30d below the current price (the condition the storefront's
   * <ShopOmnibusPrice> renders on).
   */
  async updateProduct(
    accessToken: string,
    productId: number,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const res = await this.http.put(`/api/v1/products/${productId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: patch,
    })
    if (!res.ok()) {
      throw new Error(`updateProduct failed: ${res.status()} ${await res.text()}`)
    }
  }

  /** Admin: create a manual collection. Returns its id (needed to set
   * membership + to clean up in `finally`). */
  async createCollection(
    accessToken: string,
    input: { name: string, slug: string, description?: string },
  ): Promise<{ id: number }> {
    const res = await this.http.post('/api/v1/admin/collections/', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: input,
    })
    if (!res.ok()) {
      throw new Error(`createCollection failed: ${res.status()} ${await res.text()}`)
    }
    const collection = await res.json() as { id: number }
    return { id: collection.id }
  }

  /** Admin: replace a collection's membership in display order. */
  async setCollectionProducts(
    accessToken: string,
    collectionId: number,
    productIds: number[],
  ): Promise<void> {
    const res = await this.http.put(`/api/v1/admin/collections/${collectionId}/products`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: { product_ids: productIds },
    })
    if (!res.ok()) {
      throw new Error(`setCollectionProducts failed: ${res.status()} ${await res.text()}`)
    }
  }

  /** Admin: delete a collection (cleanup). 404 is fine — already gone. */
  async deleteCollection(accessToken: string, collectionId: number): Promise<void> {
    const res = await this.http.delete(`/api/v1/admin/collections/${collectionId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deleteCollection failed: ${res.status()} ${await res.text()}`)
    }
  }

  /**
   * Ensures the minimal shipping setup a checkout needs to quote: one zone
   * covering the given countries, one method (stable name), and one flat
   * rate per currency. Idempotent ("ensure" semantics, like the seeded
   * users): a country may belong to only ONE zone backend-side, and order
   * rows keep FK references to methods — so this fixture is shared and
   * never torn down. Re-running converges on the same setup.
   */
  async ensureShippingFixture(
    accessToken: string,
    input: {
      methodName: string
      countryCodes: string[]
      rates: Array<{ currency: 'USD' | 'PLN' | 'EUR', amount: number }>
    },
  ): Promise<{ zoneId: number, methodId: number }> {
    const auth = { authorization: `Bearer ${accessToken}` }
    const list = async <T>(path: string): Promise<T[]> => {
      const res = await this.http.get(path, { headers: auth })
      if (!res.ok()) throw new Error(`${path} failed: ${res.status()} ${await res.text()}`)
      return (await res.json() as { items: T[] }).items
    }

    // Zone: reuse any zone already covering the first country (countries are
    // exclusive across zones), else create one for all requested countries.
    let zoneId: number | null = null
    const zones = await list<{ id: number }>('/api/v1/admin/shipping/zones')
    for (const z of zones) {
      const detailRes = await this.http.get(`/api/v1/admin/shipping/zones/${z.id}`, { headers: auth })
      if (!detailRes.ok()) continue
      const detail = await detailRes.json() as { id: number, country_codes: string[] }
      if (input.countryCodes.every(c => detail.country_codes.includes(c))) {
        zoneId = detail.id
        break
      }
    }
    if (zoneId === null) {
      const zoneRes = await this.http.post('/api/v1/admin/shipping/zones', {
        headers: auth,
        data: { name: `${input.methodName} zone`, country_codes: input.countryCodes },
      })
      if (!zoneRes.ok()) {
        throw new Error(`create zone failed: ${zoneRes.status()} ${await zoneRes.text()}`)
      }
      zoneId = (await zoneRes.json() as { id: number }).id
    }

    // Method: match by exact name, else create.
    const methods = await list<{ id: number, name: string }>('/api/v1/admin/shipping/methods')
    let methodId = methods.find(m => m.name === input.methodName)?.id ?? null
    if (methodId === null) {
      const methodRes = await this.http.post('/api/v1/admin/shipping/methods', {
        headers: auth,
        data: { name: input.methodName },
      })
      if (!methodRes.ok()) {
        throw new Error(`create method failed: ${methodRes.status()} ${await methodRes.text()}`)
      }
      methodId = (await methodRes.json() as { id: number }).id
    }

    // Rates: per currency — update the amount if a rate exists, else create.
    interface RateRow {
      id: number
      zone_id: number
      method_id: number
      currency: string
      amount: number
    }
    const rates = await list<RateRow>('/api/v1/admin/shipping/rates')
    for (const wanted of input.rates) {
      const existing = rates.find(r =>
        r.zone_id === zoneId && r.method_id === methodId && r.currency === wanted.currency,
      )
      if (existing && existing.amount === wanted.amount) continue
      const res = existing
        ? await this.http.put(`/api/v1/admin/shipping/rates/${existing.id}`, {
            headers: auth,
            data: { amount: wanted.amount },
          })
        : await this.http.post('/api/v1/admin/shipping/rates', {
            headers: auth,
            data: {
              zone_id: zoneId,
              method_id: methodId,
              currency: wanted.currency,
              amount: wanted.amount,
            },
          })
      if (!res.ok()) {
        throw new Error(`ensure rate failed: ${res.status()} ${await res.text()}`)
      }
    }
    return { zoneId, methodId }
  }

  /**
   * DB: a shipping zone by its (UNIQUE) name, with the country codes attached
   * to it. Countries live in `shipping_zone_countries`, whose `country_code` is
   * globally UNIQUE — a country belongs to exactly one zone, which is why a
   * shipping-CRUD spec must claim a country no other fixture uses.
   */
  async getShippingZoneByName(name: string): Promise<
    { id: number, countryCodes: string[], isActive: boolean } | null
  > {
    const res = await this.pg.query<{
      id: number
      is_active: boolean
      country_codes: string[] | null
    }>(
      `SELECT z.id,
              z.is_active,
              array_remove(array_agg(c.country_code ORDER BY c.country_code), NULL)
                AS country_codes
         FROM shipping_zones z
         LEFT JOIN shipping_zone_countries c ON c.zone_id = z.id
        WHERE z.name = $1
        GROUP BY z.id, z.is_active`,
      [name],
    )
    const row = res.rows[0]
    return row
      ? { id: row.id, countryCodes: row.country_codes ?? [], isActive: row.is_active }
      : null
  }

  /**
   * DB: whichever zone currently claims a country code, if any. `country_code`
   * is globally UNIQUE, so this answers "is this country free to claim?" — the
   * question a shipping-CRUD spec must ask before it builds its own zone, since
   * a run killed by the test timeout never finishes its cleanup.
   */
  async getShippingZoneByCountry(countryCode: string): Promise<
    { id: number, name: string } | null
  > {
    const res = await this.pg.query<{ id: number, name: string }>(
      `SELECT z.id, z.name
         FROM shipping_zones z
         JOIN shipping_zone_countries c ON c.zone_id = z.id
        WHERE c.country_code = $1`,
      [countryCode],
    )
    const row = res.rows[0]
    return row ? { id: row.id, name: row.name } : null
  }

  /** DB: a shipping method by its (UNIQUE) name. */
  async getShippingMethodByName(name: string): Promise<
    { id: number, code: string | null, isActive: boolean } | null
  > {
    const res = await this.pg.query<{ id: number, code: string | null, is_active: boolean }>(
      'SELECT id, code, is_active FROM shipping_methods WHERE name = $1',
      [name],
    )
    const row = res.rows[0]
    return row ? { id: row.id, code: row.code, isActive: row.is_active } : null
  }

  /**
   * DB: the rate at a (zone, method, currency) coordinate — the UNIQUE key of
   * `shipping_rates`, and the row that literally sets what checkout charges.
   * `amount` is Numeric(12,2) (pg returns a string) → coerced. A null
   * `free_above_subtotal` with no tiers is what the UI labels "flat".
   */
  async getShippingRateRow(
    zoneId: number,
    methodId: number,
    currency: string,
  ): Promise<{ id: number, amount: number, freeAbove: number | null } | null> {
    const res = await this.pg.query<{
      id: number
      amount: string
      free_above_subtotal: string | null
    }>(
      `SELECT id, amount, free_above_subtotal
         FROM shipping_rates
        WHERE zone_id = $1 AND method_id = $2 AND currency = $3`,
      [zoneId, methodId, currency],
    )
    const row = res.rows[0]
    return row
      ? {
          id: row.id,
          amount: Number(row.amount),
          freeAbove: row.free_above_subtotal === null ? null : Number(row.free_above_subtotal),
        }
      : null
  }

  /** Admin: drop a shipping zone (cascades its rates). Cleanup seam. */
  async deleteShippingZone(accessToken: string, zoneId: number): Promise<void> {
    const res = await this.http.delete(`/api/v1/admin/shipping/zones/${zoneId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deleteShippingZone failed: ${res.status()} ${await res.text()}`)
    }
  }

  /** Admin: drop a shipping method (cascades its rates). Cleanup seam. */
  async deleteShippingMethod(accessToken: string, methodId: number): Promise<void> {
    const res = await this.http.delete(`/api/v1/admin/shipping/methods/${methodId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deleteShippingMethod failed: ${res.status()} ${await res.text()}`)
    }
  }

  /**
   * Admin: reconcile the product's option/variant matrix in one call.
   * Returns the created options (with value IDs) and variant IDs so the
   * caller can look them up by title.
   */
  async createProductVariants(
    accessToken: string,
    productId: number,
    matrix: {
      options: Array<{
        name: string
        position?: number
        values: Array<{ value: string, position?: number }>
      }>
      variants: Array<{
        option_values: string[]
        sku?: string
        price_usd?: number | null
        price_pln?: number | null
        price_eur?: number | null
        initial_stock?: number
        is_active?: boolean
      }>
    },
  ): Promise<{
    options: Array<{ id: number, name: string, values: Array<{ id: number, value: string }> }>
    variants: Array<{ id: number, title: string, sku: string | null, stock: number }>
  }> {
    const res = await this.http.put(`/api/v1/products/${productId}/options`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: matrix,
    })
    if (!res.ok()) {
      throw new Error(`createProductVariants failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  /** Admin-creates a discount code for coupon-redemption specs. */
  async createCoupon(
    accessToken: string,
    input: {
      code: string
      discount_type: 'percent' | 'fixed'
      value: number
      currency?: 'USD' | 'PLN' | 'EUR' | null
      min_order_amount?: number | null
      is_active?: boolean
      is_automatic?: boolean
    },
  ): Promise<{ id: number, code: string }> {
    const res = await this.http.post('/api/v1/admin/coupons/', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: input,
    })
    if (!res.ok()) {
      throw new Error(`createCoupon failed: ${res.status()} ${await res.text()}`)
    }
    const coupon = await res.json() as { id: number, code: string }
    return { id: coupon.id, code: coupon.code }
  }

  /** Admin coupon detail — used to assert server-side redemption state. */
  async getCoupon(accessToken: string, couponId: number): Promise<{
    id: number
    code: string
    used_count: number
  }> {
    const res = await this.http.get(`/api/v1/admin/coupons/${couponId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`getCoupon failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  async deleteCoupon(accessToken: string, couponId: number): Promise<void> {
    const res = await this.http.delete(`/api/v1/admin/coupons/${couponId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deleteCoupon failed: ${res.status()} ${await res.text()}`)
    }
  }

  /**
   * Creates an order as the customer straight through the API — for specs
   * that need an existing order without driving the checkout UI.
   */
  async createOrderViaApi(
    accessToken: string,
    input: {
      productId: number
      quantity: number
      shippingMethodId: number
      currency?: 'USD' | 'PLN' | 'EUR'
      // Redeem a gift card as a TENDER against this order (gift cards v2 money
      // path). The backend re-validates + debits it authoritatively.
      giftCardCode?: string
    },
  ): Promise<{ id: number, order_number: string, status: string }> {
    const res = await this.http.post('/api/v1/orders/', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        items: [{ product_id: input.productId, quantity: input.quantity }],
        shipping_address: '1 Fixture Way',
        shipping_city: 'New York',
        shipping_postal_code: '10001',
        shipping_country: 'US',
        shipping_method_id: input.shippingMethodId,
        currency: input.currency ?? 'USD',
        ...(input.giftCardCode ? { gift_card_code: input.giftCardCode } : {}),
      },
    })
    if (!res.ok()) {
      throw new Error(`createOrderViaApi failed: ${res.status()} ${await res.text()}`)
    }
    const order = await res.json() as { id: number, order_number: string, status: string }
    return { id: order.id, order_number: order.order_number, status: order.status }
  }

  /**
   * DB: the user's server-side cart snapshot (`saved_carts`, abandoned-cart
   * recovery), or null. Specs poll this to see the debounced
   * `PUT /carts/mine` sync land — only the sync endpoint writes this row.
   */
  async getSavedCart(userId: number): Promise<{
    items: Array<{ product_id: number, variant_id: number | null, quantity: number }>
    recovery_token: string | null
    recovery_email_sent_at: Date | null
  } | null> {
    const res = await this.pg.query<{
      items: Array<{ product_id: number, variant_id: number | null, quantity: number }>
      recovery_token: string | null
      recovery_email_sent_at: Date | null
    }>(
      `SELECT items, recovery_token, recovery_email_sent_at
         FROM saved_carts
        WHERE user_id = $1`,
      [userId],
    )
    return res.rows[0] ?? null
  }

  /**
   * DB: stamp a live recovery token onto the user's saved-cart row — exactly
   * the pair the email job commits per send (`recovery_token` +
   * `recovery_email_sent_at`; see backend
   * `app/services/abandoned_cart_email.py`). The job itself is gated on
   * store_config enablement, threshold-hours of inactivity, and marketing
   * consent — process machinery owned by backend integration tests. E2E cares
   * about the money path from a live token onward, so it's minted at the DB
   * seam (same posture as markVerified/lockUser). Node's
   * `randomBytes(32).toString('base64url')` matches the job's
   * `secrets.token_urlsafe(32)` shape (43-char base64url).
   */
  async mintCartRecoveryToken(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url')
    const res = await this.pg.query(
      `UPDATE saved_carts
          SET recovery_token = $1,
              recovery_email_sent_at = (NOW() AT TIME ZONE 'UTC')
        WHERE user_id = $2`,
      [token, userId],
    )
    if (res.rowCount !== 1) {
      throw new Error(`mintCartRecoveryToken: no saved_carts row for user ${userId}`)
    }
    return token
  }

  /**
   * DB: mint an active gift card straight into `gift_cards`, returning the
   * plaintext code the storefront will redeem. Gift-card codes are bearer money
   * — the backend only stores the sha256 hex of the *normalized* code (uppercase,
   * dashes/spaces stripped; see `crud/gift_card.py::hash_code`) plus `last4`, and
   * the plaintext exists only in the issue response/email (no resend). So E2E
   * can't read a code back from an admin-issued card; it seeds one at the DB
   * seam with a known plaintext instead (same posture as markVerified /
   * mintCartRecoveryToken). The code we mint is already normalized (uppercase,
   * no dashes), so `hash_code(code)` here matches the backend's lookup exactly.
   * `created_at`/`updated_at` are Python-side defaults (not server defaults), so
   * a raw INSERT must set them.
   */
  async mintGiftCard(input: {
    balance: number
    currency: 'USD' | 'PLN' | 'EUR'
  }): Promise<{ id: number, code: string, last4: string }> {
    const code = `E2EGIFT${randomBytes(6).toString('hex').toUpperCase()}`
    const codeHash = createHash('sha256').update(code).digest('hex')
    const last4 = code.slice(-4)
    const res = await this.pg.query<{ id: number }>(
      `INSERT INTO gift_cards
         (code_hash, last4, initial_value, balance, currency, status,
          created_at, updated_at)
       VALUES ($1, $2, $3, $3, $4, 'active',
          (NOW() AT TIME ZONE 'UTC'), (NOW() AT TIME ZONE 'UTC'))
       RETURNING id`,
      [codeHash, last4, input.balance, input.currency],
    )
    const id = res.rows[0]?.id
    if (id === undefined) throw new Error('mintGiftCard: INSERT returned no id')
    return { id, code, last4 }
  }

  /** DB: a gift card's remaining balance — asserts the redeem debit landed. */
  async getGiftCardBalance(giftCardId: number): Promise<number> {
    const res = await this.pg.query<{ balance: string }>(
      'SELECT balance FROM gift_cards WHERE id = $1',
      [giftCardId],
    )
    const raw = res.rows[0]?.balance
    if (raw === undefined) throw new Error(`getGiftCardBalance: no card ${giftCardId}`)
    return Number(raw)
  }

  /**
   * DB: the gift cards issued by a paid order (gift cards v2 — `order_id`
   * provenance). Asserts `mark_paid` minted one stored-value card per gift-card
   * unit. Plaintext is never stored (bearer money — sha256 hash + last4 only),
   * so this returns the balance/last4 for assertions, not the code.
   */
  async getGiftCardsByOrder(orderId: number): Promise<Array<{
    id: number
    balance: number
    last4: string
    currency: string
  }>> {
    const res = await this.pg.query<{
      id: number
      balance: string
      last4: string
      currency: string
    }>(
      'SELECT id, balance, last4, currency FROM gift_cards WHERE order_id = $1 ORDER BY id',
      [orderId],
    )
    return res.rows.map(r => ({
      id: r.id,
      balance: Number(r.balance),
      last4: r.last4,
      currency: r.currency,
    }))
  }

  /**
   * DB: re-key an existing gift card to a KNOWN plaintext so a test can redeem
   * it. An order-issued card's plaintext is generated server-side and only ever
   * emailed — it can't be read back (hash + last4 storage). This test-only seam
   * swaps the card's `code_hash`/`last4` (same sha256 posture as mintGiftCard),
   * returning the new plaintext the storefront/API redeems.
   */
  async rekeyGiftCard(giftCardId: number): Promise<{ code: string, last4: string }> {
    const code = `E2EREKEY${randomBytes(6).toString('hex').toUpperCase()}`
    const codeHash = createHash('sha256').update(code).digest('hex')
    const last4 = code.slice(-4)
    const res = await this.pg.query(
      `UPDATE gift_cards
         SET code_hash = $1, last4 = $2, updated_at = (NOW() AT TIME ZONE 'UTC')
       WHERE id = $3`,
      [codeHash, last4, giftCardId],
    )
    if (res.rowCount !== 1) throw new Error(`rekeyGiftCard: no card ${giftCardId}`)
    return { code, last4 }
  }

  async getUserId(email: string): Promise<number> {
    const res = await this.pg.query<{ id: number }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    )
    const id = res.rows[0]?.id
    if (id === undefined) throw new Error(`getUserId: no user for ${email}`)
    return id
  }

  /**
   * Makes a user B2B: admin-creates a company with the user as its primary
   * contact. The membership fallback resolves them as COMPANY_ADMIN — no
   * explicit company_users row needed.
   */
  /** Admin: create a Net-N payment term (net-terms tail Program A). Returns its id. */
  async createNetDaysPaymentTerm(accessToken: string, days: number): Promise<{ id: number, name: string }> {
    const name = `Net ${days}`
    const res = await this.http.post('/api/v1/admin/payment-terms/', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: { name, term_type: 'net_days', net_days: days },
    })
    if (!res.ok()) {
      throw new Error(`createPaymentTerm failed: ${res.status()} ${await res.text()}`)
    }
    const term = await res.json() as { id: number }
    return { id: term.id, name }
  }

  async createCompanyWithPrimaryUser(
    accessToken: string,
    input: {
      name: string
      primaryUserId: number
      // B2B net terms: when set, the company allows pay-on-account. A named
      // payment term (Program A) decides the due date; `creditLimit` (in
      // `defaultCurrency`) hard-blocks the option over the limit. Pass either a
      // pre-created `paymentTermId` or `days` (a Net-N term is created for you).
      netTerms?: {
        days?: number
        paymentTermId?: number
        creditLimit?: number
        defaultCurrency?: string
      }
    },
  ): Promise<{ id: number }> {
    let paymentTermId = input.netTerms?.paymentTermId
    if (input.netTerms && paymentTermId === undefined) {
      paymentTermId = (await this.createNetDaysPaymentTerm(accessToken, input.netTerms.days ?? 30)).id
    }
    const res = await this.http.post('/api/v1/admin/companies/', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        name: input.name,
        primary_user_id: input.primaryUserId,
        status: 'approved',
        ...(input.netTerms
          ? {
              net_terms_enabled: true,
              payment_term_id: paymentTermId,
              credit_limit: input.netTerms.creditLimit ?? null,
              default_currency: input.netTerms.defaultCurrency ?? 'USD',
            }
          : {}),
      },
    })
    if (!res.ok()) {
      throw new Error(`createCompany failed: ${res.status()} ${await res.text()}`)
    }
    const company = await res.json() as { id: number }
    return { id: company.id }
  }

  /**
   * Stamp a company's EU VAT-ID as VIES-confirmed — a DB seam (same posture as
   * markVerified / lockUser / mintGiftCard). Real confirmation goes through the
   * VIES service, which is dark-gated (`VIES_ENABLED` off ⇒ 503) and would hit an
   * external, flaky SOAP/REST endpoint; the `vies_*` fields are read-only on the
   * API by design (U3). Setting them directly is the only deterministic way to
   * make a company reverse-charge-eligible (U4 reads `vies_valid` + a fresh
   * `vies_confirmed_at`). Times are naive UTC to match the column convention.
   */
  async confirmCompanyVies(companyId: number, vatId: string): Promise<void> {
    await this.pg.query(
      `UPDATE companies
         SET vat_id = $2,
             vies_valid = true,
             vies_confirmed_at = (NOW() AT TIME ZONE 'UTC'),
             vies_confirmed_name = 'E2E Verified GmbH',
             vies_last_checked_at = (NOW() AT TIME ZONE 'UTC')
       WHERE id = $1`,
      [companyId, vatId],
    )
  }

  /**
   * Admin-records the bank transfer settling a net-terms (pay-on-account) order.
   * Stamps `net_terms_paid_at` server-side (Program 2). Returns the updated order.
   */
  async recordNetTermsPayment(
    accessToken: string,
    orderId: number,
  ): Promise<{ net_terms_paid_at: string | null }> {
    const res = await this.http.post(`/api/v1/orders/${orderId}/record-net-terms-payment`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`recordNetTermsPayment failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json() as { net_terms_paid_at: string | null }
  }

  /**
   * The caller's B2B net-terms credit summary (`GET /companies/me/credit`).
   * `outstanding` / `available` are reported in the company's billing
   * `currency` — cross-currency AR is converted via admin FX rates (tail
   * Program D), which the cross-currency money-path spec asserts on.
   */
  async getMyCompanyCredit(accessToken: string): Promise<{
    net_terms_enabled: boolean
    currency: string | null
    credit_limit: number | null
    outstanding: number
    available: number | null
    payment_term: { name: string } | null
  }> {
    const res = await this.http.get('/api/v1/companies/me/credit', {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`getMyCompanyCredit failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  async deleteCompany(accessToken: string, companyId: number): Promise<void> {
    const res = await this.http.delete(`/api/v1/admin/companies/${companyId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deleteCompany failed: ${res.status()} ${await res.text()}`)
    }
  }

  /**
   * Admin-creates a B2B price list with one product-grain entry (all three
   * currency prices) for the price-list money-path spec. Returns the list id.
   */
  async createPriceListWithEntry(
    accessToken: string,
    input: {
      name: string
      productId: number
      priceUsd: number
      pricePln: number
      priceEur: number
    },
  ): Promise<{ id: number }> {
    const auth = { authorization: `Bearer ${accessToken}` }
    const listRes = await this.http.post('/api/v1/admin/price-lists/', {
      headers: auth,
      data: { name: input.name, is_active: true },
    })
    if (!listRes.ok()) {
      throw new Error(`createPriceList failed: ${listRes.status()} ${await listRes.text()}`)
    }
    const list = await listRes.json() as { id: number }
    const entryRes = await this.http.post(`/api/v1/admin/price-lists/${list.id}/entries`, {
      headers: auth,
      data: {
        product_id: input.productId,
        variant_id: null,
        price_usd: input.priceUsd,
        price_pln: input.pricePln,
        price_eur: input.priceEur,
      },
    })
    if (!entryRes.ok()) {
      throw new Error(`addPriceListEntry failed: ${entryRes.status()} ${await entryRes.text()}`)
    }
    return { id: list.id }
  }

  /** Admin: assign a price list to a company (PATCH `price_list_id`). */
  async assignPriceListToCompany(
    accessToken: string,
    companyId: number,
    priceListId: number,
  ): Promise<void> {
    const res = await this.http.patch(`/api/v1/admin/companies/${companyId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: { price_list_id: priceListId },
    })
    if (!res.ok()) {
      throw new Error(`assignPriceList failed: ${res.status()} ${await res.text()}`)
    }
  }

  /** Admin: delete a price list (204; assigned companies unassign via SET NULL). */
  async deletePriceList(accessToken: string, priceListId: number): Promise<void> {
    const res = await this.http.delete(`/api/v1/admin/price-lists/${priceListId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deletePriceList failed: ${res.status()} ${await res.text()}`)
    }
  }

  /** The company's quotes as seen by a B2B customer (newest first). */
  async listQuotes(accessToken: string): Promise<Array<{
    id: number
    status: string
    currency: string
    subtotal: number
    total: number
    items?: Array<{ product_id: number | null, quantity: number, unit_price: number }>
  }>> {
    const res = await this.http.get('/api/v1/quotes/', {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`listQuotes failed: ${res.status()} ${await res.text()}`)
    }
    interface QuoteRow {
      id: number
      status: string
      currency: string
      subtotal: number
      total: number
    }
    const body = await res.json() as QuoteRow[] | { items: QuoteRow[] }
    return Array.isArray(body) ? body : body.items
  }

  /** Full quote detail incl. server-priced line items. */
  async getQuote(accessToken: string, quoteId: number): Promise<{
    id: number
    status: string
    currency: string
    subtotal: number
    total: number
    items: Array<{ product_id: number | null, quantity: number, unit_price: number }>
  }> {
    const res = await this.http.get(`/api/v1/quotes/${quoteId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`getQuote failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  /**
   * Admin: author a quote for a company. The *customer request* leg is covered
   * by `account/quote-request.spec.ts`; specs about the admin negotiation and
   * conversion legs need a quote that already exists, with a deliberately
   * negotiated `unit_price` that differs from the product's list price (that
   * gap is what proves conversion honours the quote instead of re-pricing).
   * Status defaults to `draft` server-side.
   */
  async createQuote(
    adminToken: string,
    input: {
      companyId: number
      currency?: string
      items: Array<{
        description: string
        quantity: number
        unitPrice: number
        productId?: number
      }>
    },
  ): Promise<{ id: number, status: string, total: number }> {
    const res = await this.http.post('/api/v1/admin/quotes/', {
      headers: { authorization: `Bearer ${adminToken}` },
      data: {
        company_id: input.companyId,
        currency: input.currency ?? 'USD',
        items: input.items.map(i => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          product_id: i.productId ?? null,
        })),
      },
    })
    if (!res.ok()) {
      throw new Error(`createQuote failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  /**
   * DB: a quote's status + its conversion marker. `converted_order_id` is the
   * one-way latch that makes a second convert a 409, so it is the authoritative
   * answer to "did this quote actually mint an order".
   */
  async getQuoteRow(quoteId: number): Promise<{
    status: string
    convertedOrderId: number | null
  }> {
    const res = await this.pg.query<{ status: string, converted_order_id: number | null }>(
      'SELECT status, converted_order_id FROM quotes WHERE id = $1',
      [quoteId],
    )
    const row = res.rows[0]
    if (!row) throw new Error(`getQuoteRow: no quote ${quoteId}`)
    return { status: row.status, convertedOrderId: row.converted_order_id }
  }

  /**
   * DB: an order's ownership + money truth with its line snapshots. Reads pg
   * rather than the API because the interesting question for admin-minted
   * orders is *who owns it* (`user_id`), which the order response never spells
   * out. `orders.status` is an enum stored UPPERCASE → lowered here to match
   * how status reads everywhere else in the suite; money columns are
   * Numeric(12,2), which pg returns as strings.
   */
  async getOrderRow(orderId: number): Promise<{
    userId: number | null
    status: string
    total: number
    shipping: number
    items: Array<{ productId: number | null, quantity: number, unitPrice: number }>
  }> {
    const orderRes = await this.pg.query<{
      user_id: number | null
      status: string
      total: string
      shipping: string
    }>(
      'SELECT user_id, lower(status::text) AS status, total, shipping FROM orders WHERE id = $1',
      [orderId],
    )
    const order = orderRes.rows[0]
    if (!order) throw new Error(`getOrderRow: no order ${orderId}`)
    const itemsRes = await this.pg.query<{
      product_id: number | null
      quantity: number
      unit_price: string
    }>(
      'SELECT product_id, quantity, unit_price FROM order_items WHERE order_id = $1 ORDER BY id',
      [orderId],
    )
    return {
      userId: order.user_id,
      status: order.status,
      total: Number(order.total),
      shipping: Number(order.shipping),
      items: itemsRes.rows.map(r => ({
        productId: r.product_id,
        quantity: r.quantity,
        unitPrice: Number(r.unit_price),
      })),
    }
  }

  /** Customer address book — server-side source of truth for address specs. */
  async listAddresses(accessToken: string): Promise<Array<{
    id: number
    recipient_name: string
    street: string
    city: string
    is_default_shipping: boolean
    is_default_billing: boolean
  }>> {
    const res = await this.http.get('/api/v1/addresses/', {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`listAddresses failed: ${res.status()} ${await res.text()}`)
    }
    const body = await res.json() as Array<{
      id: number
      recipient_name: string
      street: string
      city: string
      is_default_shipping: boolean
      is_default_billing: boolean
    }> | { items: Array<never> }
    return Array.isArray(body) ? body : body.items
  }

  /**
   * DB: a product's money + flag columns. `price_usd` is Numeric(12,2) (pg
   * returns a string) → coerced. This is the authoritative answer to "did that
   * CSV import / bulk edit actually write", which the list UI only shows
   * formatted.
   */
  async getProductRow(productId: number): Promise<{
    slug: string
    priceUsd: number
    isActive: boolean
  }> {
    const res = await this.pg.query<{
      slug: string
      price_usd: string
      is_active: boolean
    }>(
      'SELECT slug, price_usd, is_active FROM products WHERE id = $1',
      [productId],
    )
    const row = res.rows[0]
    if (!row) throw new Error(`getProductRow: no product ${productId}`)
    return { slug: row.slug, priceUsd: Number(row.price_usd), isActive: row.is_active }
  }

  /**
   * The products CSV export called directly with a bearer token.
   *
   * The browser path cannot see `Content-Disposition` — the backend sets no CORS
   * `expose_headers`, so `useExportProducts` always falls back to the generic
   * `products.csv`. That makes this the *only* place the backend's
   * `_export_filename` (and the media type) is observable at all.
   */
  async fetchProductExportCsv(
    adminToken: string,
  ): Promise<{ status: number, contentType: string, disposition: string, body: string }> {
    const res = await this.http.get('/api/v1/admin/products/export', {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const headers = res.headers()
    return {
      status: res.status(),
      contentType: headers['content-type'] ?? '',
      disposition: headers['content-disposition'] ?? '',
      body: await res.text(),
    }
  }

  /** Current stock for a product — verifies cancel restores reserved stock. */
  async getProductStock(productId: number): Promise<number> {
    const res = await this.pg.query<{ stock: number }>(
      'SELECT stock FROM products WHERE id = $1',
      [productId],
    )
    return res.rows[0]?.stock ?? -1
  }

  /** Customer order list — newest first, used to verify checkout created an order. */
  async listOrders(accessToken: string): Promise<Array<{
    id: number
    order_number: string
    status: string
    total: number
    currency: string
  }>> {
    const res = await this.http.get('/api/v1/orders/', {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`listOrders failed: ${res.status()} ${await res.text()}`)
    }
    const page = await res.json() as { items: Array<{
      id: number
      order_number: string
      status: string
      total: number
      currency: string
    }> }
    return page.items
  }

  /** Full order detail (customer-owned) — the server-side source of truth. */
  async getOrder(accessToken: string, orderId: number): Promise<{
    id: number
    order_number: string
    status: string
    subtotal: number
    shipping: number
    discount: number
    total: number
    // Derived VAT total — always 0 here: prices are stored VAT-inclusive
    // (gross), so VAT is decomposed on the faktura at print time, never stored
    // on the order. The vat-decomposition spec asserts this and reads the
    // per-line rate snapshots via getOrderItemVatRates instead.
    tax: number
    currency: string
    coupon_code: string | null
    // Stored-value tenders (gift cards + store credit). `amount_due = total −
    // gift_card_amount − store_credit_amount`; a provider charges `amount_due`,
    // and `amount_due === 0` means the order was PAID at creation.
    gift_card_amount: number
    store_credit_amount: number
    amount_due: number
    gift_card_last4: string | null
    // PL launch fields (optional — only the PL money-path spec asserts them).
    payment_method?: string
    // B2B net terms (optional — only the net-terms money-path spec asserts them).
    company_id?: number | null
    payment_due_at?: string | null
    net_terms_paid_at?: string | null
    // EU reverse charge (optional — only the reverse-charge money-path spec asserts
    // them). `tax_treatment` is `domestic` | `reverse_charge`; `buyer_vat_id` is the
    // snapshotted EU VAT-ID the faktura printed (U4/U5).
    tax_treatment?: string
    buyer_vat_id?: string | null
    invoice_nip?: string | null
    invoice_name?: string | null
    inpost_point_id?: string | null
    inpost_point_name?: string | null
    shipping_address: string
    shipping_city: string
    shipping_postal_code: string
    shipping_country: string
    items: Array<{
      product_id: number
      variant_id: number | null
      variant_title: string | null
      quantity: number
      unit_price: number
      total_price: number
    }>
  }> {
    const res = await this.http.get(`/api/v1/orders/${orderId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`getOrder failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  /** Public (no-auth) guest order tracking — mirrors GET /orders/track/{token}. */
  async trackGuestOrder(token: string): Promise<{
    order_number: string
    status: string
    items: Array<{
      product_name: string
      variant_title: string | null
      quantity: number
      unit_price: number
      total_price: number
    }>
    subtotal: number
    discount: number
    shipping: number
    total: number
    currency: string
    shipping_city: string
    shipping_country: string
  }> {
    const res = await this.http.get(`/api/v1/orders/track/${token}`)
    if (!res.ok()) {
      throw new Error(`trackGuestOrder failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  /** Admin: advance an order's status (forward-only workflow). */
  async advanceOrderStatus(adminToken: string, orderId: number, newStatus: string): Promise<void> {
    const res = await this.http.patch(`/api/v1/orders/${orderId}`, {
      headers: { authorization: `Bearer ${adminToken}` },
      data: { status: newStatus },
    })
    if (!res.ok()) {
      throw new Error(`advanceOrderStatus(${newStatus}) failed: ${res.status()} ${await res.text()}`)
    }
  }

  /** Customer: list return requests for an owned order. */
  async listOrderReturns(accessToken: string, orderId: number): Promise<Array<{
    id: number
    status: string
    items: Array<{ order_item_id: number, quantity: number, reason: string }>
  }>> {
    const res = await this.http.get(`/api/v1/orders/${orderId}/returns`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok()) {
      throw new Error(`listOrderReturns failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  /**
   * Customer: raise a return request against a delivered order. The customer
   * modal leg is covered by `account/rma.spec.ts`; specs about the *admin*
   * decision leg start from an already-filed request, so they open it here
   * rather than re-driving that UI.
   */
  async createReturnRequest(
    accessToken: string,
    orderId: number,
    input: {
      items: Array<{ order_item_id: number, quantity: number, reason: string }>
      comment?: string
    },
  ): Promise<{ id: number, status: string }> {
    const res = await this.http.post(`/api/v1/orders/${orderId}/returns`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: input,
    })
    if (!res.ok()) {
      throw new Error(`createReturnRequest failed: ${res.status()} ${await res.text()}`)
    }
    return await res.json()
  }

  /**
   * DB: a return request's authoritative row. `status` is a plain lowercase
   * String(16) column (deliberately not a PG enum — see models/return_request.py),
   * so no cast is needed, unlike `orders.status`. `refund_id` is UNIQUE: one
   * refund per return, and it is the proof the RMA actually moved money.
   */
  async getReturnRow(returnId: number): Promise<{
    status: string
    refundId: number | null
    adminNote: string | null
  }> {
    const res = await this.pg.query<{
      status: string
      refund_id: number | null
      admin_note: string | null
    }>(
      'SELECT status, refund_id, admin_note FROM return_requests WHERE id = $1',
      [returnId],
    )
    const row = res.rows[0]
    if (!row) throw new Error(`getReturnRow: no return ${returnId}`)
    return { status: row.status, refundId: row.refund_id, adminNote: row.admin_note }
  }

  /** DB: order item IDs for a given order (used to build testids in the return modal). */
  async getOrderItemIds(orderId: number): Promise<number[]> {
    const res = await this.pg.query<{ id: number }>(
      'SELECT id FROM order_items WHERE order_id = $1 ORDER BY id',
      [orderId],
    )
    return res.rows.map(r => r.id)
  }

  /**
   * Resolve a tax category's id by its stable `code` (STANDARD / REDUCED_8 /
   * REDUCED_5 / ZERO — all seeded by migration 1156c88e49a4). Used to build a
   * mixed-VAT-rate cart without hard-coding auto-increment ids.
   */
  async taxCategoryIdByCode(code: string): Promise<number> {
    const res = await this.pg.query<{ id: number }>(
      'SELECT id FROM tax_categories WHERE code = $1',
      [code],
    )
    if (res.rows.length === 0) throw new Error(`tax category not found: ${code}`)
    return res.rows[0]!.id
  }

  /**
   * The per-line VAT-rate snapshots on an order, keyed by product_id. VAT is
   * never stored on the order (prices are gross; order.tax is always 0) — the
   * per-line `vat_rate` snapshot is the input the faktura decomposition groups
   * by, so it's the observable truth of the mixed-rate wiring.
   */
  async getOrderItemVatRates(orderId: number): Promise<Map<number, number>> {
    const res = await this.pg.query<{ product_id: number, vat_rate: number }>(
      'SELECT product_id, vat_rate FROM order_items WHERE order_id = $1 ORDER BY id',
      [orderId],
    )
    return new Map(res.rows.map(r => [r.product_id, r.vat_rate]))
  }

  /**
   * Refund + faktura-korygująca truth for an order, straight from pg. Reads the
   * authoritative financial record — the refund amount, the KOR number the
   * corrective invoice allocated, and the resulting order status — independent
   * of the order response schema. `amount` is Numeric(12,2) (pg returns it as a
   * string) → coerced to number; `korNumber` is null when the order had no
   * faktura to correct.
   */
  async getOrderRefundSummary(orderId: number): Promise<{
    status: string
    refunds: Array<{ amount: number, reason: string, korNumber: string | null }>
  }> {
    // The raw column stores the enum name uppercase (PARTIALLY_REFUNDED); the
    // API lowercases on serialization, so lower() here to match how status
    // reads everywhere else in the suite.
    const statusRes = await this.pg.query<{ status: string }>(
      'SELECT lower(status::text) AS status FROM orders WHERE id = $1',
      [orderId],
    )
    const refundsRes = await this.pg.query<{
      amount: string
      reason: string
      kor_number: string | null
    }>(
      `SELECT r.amount, r.reason, c.kor_number
         FROM refunds r
         LEFT JOIN corrective_invoices c ON c.refund_id = r.id
        WHERE r.order_id = $1
        ORDER BY r.id`,
      [orderId],
    )
    return {
      status: statusRes.rows[0]?.status ?? '',
      refunds: refundsRes.rows.map(r => ({
        amount: Number(r.amount),
        reason: r.reason,
        korNumber: r.kor_number,
      })),
    }
  }

  /**
   * DB: the faktura issued for an order, straight from pg. `invoices` holds one
   * row per order (`order_id` UNIQUE — issuing is idempotent) and the
   * `year`/`seq` pair backs the gap-free legal series. Null when no faktura was
   * ever issued (an unpaid order only ever gets a *proforma*, which is derived
   * at print time and never persisted).
   */
  async getOrderInvoiceRow(orderId: number): Promise<
    { invoiceNumber: string, year: number, seq: number } | null
  > {
    const res = await this.pg.query<{ invoice_number: string, year: number, seq: number }>(
      'SELECT invoice_number, year, seq FROM invoices WHERE order_id = $1',
      [orderId],
    )
    const row = res.rows[0]
    return row ? { invoiceNumber: row.invoice_number, year: row.year, seq: row.seq } : null
  }

  /**
   * The invoice PDF endpoint, called directly with a bearer token. The browser
   * path (`useDownloadInvoice`) fetches this same route as a Blob and renames it
   * client-side, so the transport-level truth — media type and the
   * `Content-Disposition` filename the backend derives from the faktura number —
   * is only observable here.
   */
  async fetchOrderInvoicePdf(
    accessToken: string,
    orderId: number,
    lang?: string,
  ): Promise<{ status: number, contentType: string, disposition: string, bytes: Buffer }> {
    const res = await this.http.get(`/api/v1/orders/${orderId}/invoice`, {
      headers: { authorization: `Bearer ${accessToken}` },
      params: lang ? { lang } : {},
    })
    const headers = res.headers()
    return {
      status: res.status(),
      contentType: headers['content-type'] ?? '',
      disposition: headers['content-disposition'] ?? '',
      bytes: await res.body(),
    }
  }

  /**
   * DB: a draft order's conversion outcome — its lifecycle `status` and the
   * `converted_order_id` the convert route stamps. Unlike `orders.status`
   * (enum NAME, uppercase), `draft_orders.status` is stored as the lowercase
   * enum VALUE in a plain String column (`open` / `completed`, mirrors
   * QuoteStatus), so no `lower()` is needed. This is the observable truth that
   * a draft was consumed into exactly one real order.
   */
  async getDraftOrderRow(draftId: number): Promise<{
    status: string
    convertedOrderId: number | null
  }> {
    const res = await this.pg.query<{ status: string, converted_order_id: number | null }>(
      'SELECT status, converted_order_id FROM draft_orders WHERE id = $1',
      [draftId],
    )
    const row = res.rows[0]
    if (!row) throw new Error(`getDraftOrderRow: no draft ${draftId}`)
    return { status: row.status, convertedOrderId: row.converted_order_id }
  }

  /** Admin: patch store config (partial update). */
  async updateStoreConfig(adminToken: string, patch: Record<string, unknown>): Promise<void> {
    const res = await this.http.patch('/api/v1/admin/settings/', {
      headers: { authorization: `Bearer ${adminToken}` },
      data: patch,
    })
    if (!res.ok()) {
      throw new Error(`updateStoreConfig failed: ${res.status()} ${await res.text()}`)
    }
  }

  async deleteProduct(accessToken: string, productId: number): Promise<void> {
    const res = await this.http.delete(`/api/v1/products/${productId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deleteProduct failed: ${res.status()} ${await res.text()}`)
    }
  }

  async deleteProductImage(
    accessToken: string,
    productId: number,
    imageId: number,
  ): Promise<void> {
    const res = await this.http.delete(`/api/v1/products/${productId}/images/${imageId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deleteProductImage failed: ${res.status()} ${await res.text()}`)
    }
  }

  async listProductImages(productId: number): Promise<Array<{
    id: number
    url: string
    alt_text: string | null
    is_primary: boolean
    sort_order: number
  }>> {
    const res = await this.pg.query<{
      id: number
      url: string
      alt_text: string | null
      is_primary: boolean
      sort_order: number
    }>(
      `SELECT id, url, alt_text, is_primary, sort_order
         FROM product_images
        WHERE product_id = $1
        ORDER BY sort_order, id`,
      [productId],
    )
    return res.rows
  }
}

function parseRefreshCookie(setCookie: string): {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
} {
  const parts = setCookie.split(/,\s*(?=[^;,\s]+=)/).find(p => p.startsWith('refresh_token='))
  if (!parts) {
    throw new Error(`refresh_token cookie not found in Set-Cookie: ${setCookie}`)
  }
  const segments = parts.split(';').map(s => s.trim())
  const [name, value] = segments[0].split('=')
  const attrs: Record<string, string> = {}
  for (const seg of segments.slice(1)) {
    const [k, v] = seg.split('=')
    attrs[k.toLowerCase()] = v ?? 'true'
  }
  const rawSameSite = (attrs.samesite ?? 'lax').toLowerCase()
  const sameSite: 'Strict' | 'Lax' | 'None'
    = rawSameSite === 'strict' ? 'Strict' : rawSameSite === 'none' ? 'None' : 'Lax'
  return {
    name,
    value,
    domain: 'localhost',
    path: attrs.path ?? '/',
    expires: -1,
    httpOnly: 'httponly' in attrs,
    secure: 'secure' in attrs,
    sameSite,
  }
}
