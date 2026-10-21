// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductGrid from './ProductGrid.vue'
import { makeProduct } from '../../../test/helpers/fixtures'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function product(id: number, name: string) {
  return makeProduct({ id, name, slug: `p-${id}` })
}

describe('ShopProductGrid', () => {
  it('renders a card per product', async () => {
    const wrapper = await mountSuspended(ProductGrid, {
      props: { products: [product(1, 'Alpha'), product(2, 'Bravo')] },
    })
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Bravo')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductGrid, {
      props: { products: [product(1, 'Alpha')] },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
