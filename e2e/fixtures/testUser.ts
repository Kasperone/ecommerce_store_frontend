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

export function randomEphemeralUser(): TestUser {
  const id = randomBytes(4).toString('hex')
  return {
    email: `e2e-${Date.now()}-${id}@e2e.example.com`,
    password: 'EphemeralPass!1',
    firstName: 'Ephemeral',
    lastName: id,
  }
}
