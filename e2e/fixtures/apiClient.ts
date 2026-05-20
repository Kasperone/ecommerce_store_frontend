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
    await this.pg.query(`UPDATE users SET role = 'ADMIN' WHERE email = $1`, [email])
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
