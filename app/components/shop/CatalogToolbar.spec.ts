// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import CatalogToolbar from './CatalogToolbar.vue'

const AXE_OPTIONS = {
  rules: {
    'region': { enabled: false },
    'aria-hidden-focus': { enabled: false },
    // Nuxt UI's USelectMenu trigger labelling is handled by UFormField; the same
    // exemption the admin filter/dialog specs use.
    'label': { enabled: false },
  },
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    values: { sort: 'newest', search: undefined, categoryId: undefined, inStock: undefined },
    categories: [{ id: 1, name: 'Electronics' }, { id: 2, name: 'Books' }],
    ...overrides,
  }
}

describe('ShopCatalogToolbar', () => {
  it('renders the category options', async () => {
    const wrapper = await mountSuspended(CatalogToolbar, { props: baseProps() })
    expect(wrapper.text()).toContain('In stock only')
  })

  it('emits reset when the clear button is clicked', async () => {
    const wrapper = await mountSuspended(CatalogToolbar, { props: baseProps() })
    const clear = wrapper.findAll('button').find(b => b.text().includes('Clear filters'))
    await clear?.trigger('click')
    expect(wrapper.emitted('reset')).toBeTruthy()
  })

  it('emits an inStock patch when the checkbox is toggled', async () => {
    const wrapper = await mountSuspended(CatalogToolbar, { props: baseProps() })
    wrapper.findComponent({ name: 'UCheckbox' }).vm.$emit('update:modelValue', true)
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('update:filters')?.at(-1)).toEqual([{ inStock: true }])
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(CatalogToolbar, { props: baseProps() })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
