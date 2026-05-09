import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, KNOWN_USER, type TestUser } from '../fixtures/testUser'

export default async function globalSetup(): Promise<void> {
  const api = await ApiClient.create()
  try {
    await api.truncateEphemeralAuthState()
    await ensureSeeded(api, KNOWN_USER)
    await ensureSeeded(api, KNOWN_ADMIN)
    await api.markVerified(KNOWN_USER.email)
    await api.markVerified(KNOWN_ADMIN.email)
    await api.promoteAdmin(KNOWN_ADMIN.email)
  } finally {
    await api.dispose()
  }
}

async function ensureSeeded(api: ApiClient, user: TestUser): Promise<void> {
  if (await api.userExists(user.email)) return
  await api.register(user)
}
