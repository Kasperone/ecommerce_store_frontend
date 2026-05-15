import { test as setup } from '@playwright/test'
import { ApiClient } from './fixtures/apiClient'
import { KNOWN_USER } from './fixtures/testUser'

const STORAGE_PATH = 'playwright/.auth/user.json'

setup('authenticate as known user', async ({ page }) => {
  const api = await ApiClient.create()
  try {
    const { refreshCookie } = await api.loginViaApi(KNOWN_USER.email, KNOWN_USER.password)
    await page.context().addCookies([refreshCookie])
    await page.context().storageState({ path: STORAGE_PATH })
  }
  finally {
    await api.dispose()
  }
})
