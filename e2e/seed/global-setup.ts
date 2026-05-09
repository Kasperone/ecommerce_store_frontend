import { ApiClient } from '../fixtures/apiClient'
import {
  KNOWN_ADMIN,
  KNOWN_USER,
  LOCKOUT_USER,
  REFRESH_USER,
  type TestUser,
} from '../fixtures/testUser'

export default async function globalSetup(): Promise<void> {
  const api = await ApiClient.create()
  try {
    await api.truncateEphemeralAuthState()
    await ensureSeeded(api, KNOWN_USER)
    await ensureSeeded(api, KNOWN_ADMIN)
    await ensureSeeded(api, LOCKOUT_USER)
    await ensureSeeded(api, REFRESH_USER)
    // markVerified also clears failed_login_attempts + locked_until — running
    // it on every globalSetup gives the lockout spec a clean slate.
    await api.markVerified(KNOWN_USER.email)
    await api.markVerified(KNOWN_ADMIN.email)
    await api.markVerified(LOCKOUT_USER.email)
    await api.markVerified(REFRESH_USER.email)
    await api.promoteAdmin(KNOWN_ADMIN.email)
  } finally {
    await api.dispose()
  }
}

async function ensureSeeded(api: ApiClient, user: TestUser): Promise<void> {
  if (await api.userExists(user.email)) return
  await api.register(user)
}
