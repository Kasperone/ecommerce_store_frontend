// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import AddToCartButton from './AddToCartButton.vue'

// `region` is a page-level rule — a false positive for a bare-mounted fragment.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('ShopAddToCartButton', () => {
  it('renders the add-to-cart label on a disabled button (cart is Phase 2)', async () => {
    const wrapper = await mountSuspended(AddToCartButton, { props: { productId: 1 } })
    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Add to Cart')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(AddToCartButton, { props: { productId: 1 } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
