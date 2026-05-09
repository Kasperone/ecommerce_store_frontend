import { randomBytes } from 'node:crypto'

export interface TestUser {
  email: string
  password: string
  firstName: string
  lastName: string
}

export const KNOWN_USER: TestUser = {
  email: 'e2e-user@e2e.example.com',
  password: 'E2EUserPass!1',
  firstName: 'E2E',
  lastName: 'User',
}

export const KNOWN_ADMIN: TestUser = {
  email: 'e2e-admin@e2e.example.com',
  password: 'E2EAdminPass!1',
  firstName: 'E2E',
  lastName: 'Admin',
}

export const LOCKOUT_USER: TestUser = {
  email: 'e2e-lockout@e2e.example.com',
  password: 'E2ELockoutPass!1',
  firstName: 'E2E',
  lastName: 'Lockout',
}

// Dedicated user for refresh.spec — keeps the slowapi 5/15min-per-email
// budget on KNOWN_USER intact. The per-IP 5/15min budget still applies, so
// running the suite back-to-back without restarting uvicorn can still trip
// the IP limiter; the README calls this out.
export const REFRESH_USER: TestUser = {
  email: 'e2e-refresh@e2e.example.com',
  password: 'E2ERefreshPass!1',
  firstName: 'E2E',
  lastName: 'Refresh',
}

export function randomEphemeralUser(): TestUser {
  const id = randomBytes(4).toString('hex')
  return {
    email: `e2e-${Date.now()}-${id}@e2e.example.com`,
    password: 'EphemeralPass!1',
    firstName: 'Ephemeral',
    lastName: id,
  }
}
