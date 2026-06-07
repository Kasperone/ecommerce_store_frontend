// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import VariantSelector from './VariantSelector.vue'

/**
 * PDP option pills (variants F2). Fixture matrix: Color (Red/Blue) × Size
 * (M/XL) with three ACTIVE variants — Blue/XL does not exist (disabled combo)
 * and Red/XL exists but is out of stock (strikethrough, still selectable).
 */

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function options() {
  return [
    {
      id: 1,
      created_at: '',
      updated_at: '',
      product_id: 1,
      name: 'Color',
      name_pl: 'Kolor',
      position: 0,
      values: [
        { id: 1, created_at: '', updated_at: '', option_id: 1, value: 'Red', value_pl: 'Czerwony', position: 0 },
        { id: 2, created_at: '', updated_at: '', option_id: 1, value: 'Blue', value_pl: 'Niebieski', position: 1 },
      ],
    },
    {
      id: 2,
      created_at: '',
      updated_at: '',
      product_id: 1,
      name: 'Size',
      name_pl: 'Rozmiar',
      position: 1,
      values: [
        { id: 3, created_at: '', updated_at: '', option_id: 2, value: 'M', value_pl: null, position: 0 },
        { id: 4, created_at: '', updated_at: '', option_id: 2, value: 'XL', value_pl: null, position: 1 },
      ],
    },
  ]
}

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    title: 'Red / M',
    title_pl: null,
    sku: null,
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    image_id: null,
    image_url: null,
    stock: 5,
    in_stock: true,
    option_value_ids: [1, 3],
    ...overrides,
  }
}

const VARIANTS = [
  variant({ id: 11, title: 'Red / M', option_value_ids: [1, 3] }),
  variant({ id: 12, title: 'Red / XL', option_value_ids: [1, 4], stock: 0, in_stock: false }),
  variant({ id: 13, title: 'Blue / M', option_value_ids: [2, 3] }),
  // Blue / XL intentionally absent.
]

async function mountSelector(props: Record<string, unknown> = {}) {
  return await mountSuspended(VariantSelector, {
    props: { options: options(), variants: VARIANTS, ...props },
  })
}

function pill(wrapper: Awaited<ReturnType<typeof mountSelector>>, valueId: number) {
  return wrapper.find(`[data-testid="variant-value-${valueId}"]`)
}

describe('ShopVariantSelector', () => {
  it('renders one labelled pill group per option', async () => {
    const wrapper = await mountSelector()
    expect(wrapper.text()).toContain('Color')
    expect(wrapper.text()).toContain('Size')
    for (const id of [1, 2, 3, 4]) {
      expect(pill(wrapper, id).exists()).toBe(true)
    }
    expect(wrapper.text()).toContain('Red')
    expect(wrapper.text()).toContain('XL')
  })

  it('resolves the variant only once every option has a selection', async () => {
    const wrapper = await mountSelector()
    await pill(wrapper, 1).trigger('click') // Red
    // Half-selected: still unresolved — the model stays null (no emit yet).
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0] ?? null).toBeNull()
    await pill(wrapper, 3).trigger('click') // M
    const last = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { id: number }
    expect(last.id).toBe(11)
  })

  it('clicking a selected value again deselects it (back to unresolved)', async () => {
    const wrapper = await mountSelector()
    await pill(wrapper, 1).trigger('click')
    await pill(wrapper, 3).trigger('click')
    await pill(wrapper, 3).trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })

  it('disables a value with no matching variant for the current other selections', async () => {
    const wrapper = await mountSelector()
    // Nothing selected: every value has at least one variant.
    expect(pill(wrapper, 4).attributes('disabled')).toBeUndefined()
    await pill(wrapper, 2).trigger('click') // Blue
    // Blue/XL does not exist → XL disabled.
    expect(pill(wrapper, 4).attributes('disabled')).toBeDefined()
    expect(pill(wrapper, 3).attributes('disabled')).toBeUndefined()
  })

  it('strikes through a value whose only matching variants are out of stock', async () => {
    const wrapper = await mountSelector()
    await pill(wrapper, 1).trigger('click') // Red
    // Red/XL exists but is out of stock → strikethrough, still clickable.
    expect(pill(wrapper, 4).classes()).toContain('line-through')
    expect(pill(wrapper, 4).attributes('disabled')).toBeUndefined()
    await pill(wrapper, 4).trigger('click')
    const last = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { id: number }
    expect(last.id).toBe(12)
  })

  it('does not strike through out-of-stock combos when backorder is allowed', async () => {
    const wrapper = await mountSelector({ allowBackorder: true })
    await pill(wrapper, 1).trigger('click') // Red
    expect(pill(wrapper, 4).classes()).not.toContain('line-through')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSelector()
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
