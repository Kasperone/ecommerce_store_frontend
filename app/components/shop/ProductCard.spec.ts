// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductCard from './ProductCard.vue'
import { makeProduct } from '../../../test/helpers/fixtures'
import type { ProductWithCategory } from '#shared/types/api'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function product(overrides: Partial<ProductWithCategory> = {}) {
  return makeProduct({
    name: 'Blue Mug',
    slug: 'blue-mug',
    price_usd: 12,
    price_pln: 48,
    price_eur: 11,
    ...overrides,
  })
}

describe('ShopProductCard', () => {
  it('renders the name, a price, and links to the product page', async () => {
    const wrapper = await mountSuspended(ProductCard, { props: { product: product() } })
    expect(wrapper.text()).toContain('Blue Mug')
    expect(wrapper.text()).toContain('$')
    expect(wrapper.html()).toContain('/products/blue-mug')
  })

  it('renders the localized display name (EN fallback under the default locale)', async () => {
    // name_pl is set but the default test locale is `en`, so the EN name shows.
    // The PL branch of the helper is covered in localizedProduct.spec.ts.
    const wrapper = await mountSuspended(ProductCard, {
      props: { product: product({ name: 'Blue Mug', name_pl: 'Niebieski kubek' }) },
    })
    expect(wrapper.text()).toContain('Blue Mug')
    expect(wrapper.text()).not.toContain('Niebieski kubek')
  })

  it('shows an out-of-stock badge when stock is 0', async () => {
    const wrapper = await mountSuspended(ProductCard, { props: { product: product({ stock: 0 }) } })
    expect(wrapper.text()).toContain('Out of Stock')
  })

  it('renders an enabled add-to-cart button for in-stock products', async () => {
    const wrapper = await mountSuspended(ProductCard, { props: { product: product() } })
    expect(wrapper.text()).toContain('Add to Cart')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductCard, { props: { product: product() } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
