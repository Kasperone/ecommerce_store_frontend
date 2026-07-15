import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, KNOWN_USER } from '../fixtures/testUser'

// B2B price-list money-path (Shopify-gap P2 #14): an active company member whose
// company has a price list sees their negotiated "Your price" on the product page.
//
// Seeds entirely via the API (admin), then drives the storefront as the B2B
// customer. The authoritative checkout pricing is covered by backend integration
// tests; this spec guards the storefront DISPLAY wiring end-to-end (the public
// PDP fetch is anonymous, so the b2b price comes from the client-only, B2B-gated
// companion fetch — the exact wiring that unit specs can't exercise through the
// real Nuxt auth + company-context plugins).
//
// KNOWN_USER is a shared seeded account, so the company is torn down in `finally`
// to avoid leaving them B2B for later specs.

test.use({ storageState: { cookies: [], origins: [] } })

test('B2B member sees their negotiated price on the product page', async ({ page }) => {
  // Generous budget: first storefront hit eats a cold Vite compile.
  test.setTimeout(90_000)

  const api = await ApiClient.create()
  const slug = `pl-e2e-widget-${Date.now()}`
  let companyId: number | null = null
  let priceListId: number | null = null

  try {
    const { accessToken: adminAccess } = await api.loginViaApi(
      KNOWN_ADMIN.email,
      KNOWN_ADMIN.password,
    )
    const userId = await api.userIdByEmail(KNOWN_USER.email)

    // Catalog price is high; the negotiated list price is low, so the "Your
    // price" line is unmistakably the list price and not the catalog price.
    const product = await api.createProduct(adminAccess, {
      name: 'PL E2E Widget',
      slug,
      price_usd: 100,
      price_pln: 400,
      price_eur: 90,
      stock: 25,
    })
    priceListId = (await api.createPriceListWithEntry(adminAccess, {
      name: `PL E2E List ${Date.now()}`,
      productId: product.id,
      priceUsd: 5,
      pricePln: 20,
      priceEur: 4,
    })).id
    companyId = (await api.createCompanyWithPrimaryUser(adminAccess, {
      name: `PL E2E Co ${Date.now()}`,
      primaryUserId: userId,
    })).id
    await api.assignPriceListToCompany(adminAccess, companyId, priceListId)

    // Boot the storefront as the B2B customer (refresh-cookie session restore).
    const { refreshCookie } = await api.loginViaApi(KNOWN_USER.email, KNOWN_USER.password)
    await page.context().addCookies([{
      name: refreshCookie.name,
      value: refreshCookie.value,
      domain: refreshCookie.domain,
      path: refreshCookie.path,
      expires: refreshCookie.expires,
      httpOnly: refreshCookie.httpOnly,
      secure: refreshCookie.secure,
      sameSite: refreshCookie.sameSite,
    }])

    await page.goto(`/products/${slug}`)

    // The negotiated-price line appears once the B2B-gated companion fetch
    // resolves (Playwright auto-waits). It reads "Your price: <amount>".
    const b2bPrice = page.getByTestId('b2b-price')
    await expect(b2bPrice).toBeVisible({ timeout: 30_000 })
    await expect(b2bPrice).toContainText(/your price/i)
  }
  finally {
    // Tear down so KNOWN_USER isn't left B2B (deleting the company clears the
    // membership); then drop the now-unassigned list.
    try {
      const { accessToken: adminAccess } = await api.loginViaApi(
        KNOWN_ADMIN.email,
        KNOWN_ADMIN.password,
      )
      if (companyId !== null) await api.deleteCompany(adminAccess, companyId)
      if (priceListId !== null) await api.deletePriceList(adminAccess, priceListId)
    }
    finally {
      await api.dispose()
    }
  }
})
