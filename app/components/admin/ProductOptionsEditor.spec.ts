// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductOptionsEditor from './ProductOptionsEditor.vue'
import type { OptionDraft } from '~/composables/queries/useVariantQueries'

/**
 * Option-axes editor (variants F1). The editor owns its rows (seeded once
 * from `initial`) and emits `update:options` on every change — the
 * QuoteLineItemsEditor pattern. URL/verb mapping lives in
 * useVariantQueries.spec.ts; the matrix rows in ProductVariantsMatrix.spec.ts.
 */

// `region` is a page-level landmark rule — N/A to an isolated editor card.
const AXE_OPTIONS = {
  rules: {
    region: { enabled: false },
  },
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function colorOption(): OptionDraft {
  return {
    name: 'Color',
    namePl: 'Kolor',
    values: [
      { value: 'Red', valuePl: 'Czerwony' },
      { value: 'Blue', valuePl: '' },
    ],
  }
}

function lastEmitted(wrapper: any): OptionDraft[] {
  const emitted = wrapper.emitted('update:options') as [OptionDraft[]][] | undefined
  expect(emitted).toBeTruthy()
  return emitted![emitted!.length - 1]![0]
}

describe('AdminProductOptionsEditor', () => {
  it('seeds rows from `initial` and emits them on mount', async () => {
    const wrapper = await mountSuspended(ProductOptionsEditor, {
      props: { initial: [colorOption()] },
    })
    expect(wrapper.find('[data-testid="product-option-0"]').exists()).toBe(true)
    expect(lastEmitted(wrapper)).toEqual([colorOption()])
  })

  it('adds a blank option row and re-emits', async () => {
    const wrapper = await mountSuspended(ProductOptionsEditor, {
      props: { initial: [] },
    })
    await wrapper.find('[data-testid="product-options-add"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(lastEmitted(wrapper)).toEqual([
      { name: '', namePl: '', values: [{ value: '', valuePl: '' }] },
    ])
  })

  it('caps the editor at three options (button disabled + hint)', async () => {
    const wrapper = await mountSuspended(ProductOptionsEditor, {
      props: {
        initial: [
          colorOption(),
          { name: 'Size', namePl: '', values: [{ value: 'XL', valuePl: '' }] },
          { name: 'Material', namePl: '', values: [{ value: 'Wool', valuePl: '' }] },
        ],
      },
    })
    const addButton = wrapper.find('[data-testid="product-options-add"]')
    expect(addButton.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="product-options-cap-hint"]').exists()).toBe(true)

    // Belt-and-braces: calling the method directly must also be a no-op.
    ;(wrapper.vm as any).addOption()
    await new Promise(r => setTimeout(r, 0))
    expect(lastEmitted(wrapper)).toHaveLength(3)
  })

  it('removes an option row', async () => {
    const wrapper = await mountSuspended(ProductOptionsEditor, {
      props: {
        initial: [
          colorOption(),
          { name: 'Size', namePl: '', values: [{ value: 'XL', valuePl: '' }] },
        ],
      },
    })
    await wrapper.find('[data-testid="product-option-0-remove"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    const emitted = lastEmitted(wrapper)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.name).toBe('Size')
  })

  it('reorders options with the up/down arrows', async () => {
    const wrapper = await mountSuspended(ProductOptionsEditor, {
      props: {
        initial: [
          colorOption(),
          { name: 'Size', namePl: '', values: [{ value: 'XL', valuePl: '' }] },
        ],
      },
    })
    await wrapper.find('[data-testid="product-option-1-up"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(lastEmitted(wrapper).map(o => o.name)).toEqual(['Size', 'Color'])
  })

  it('adds and removes values within an option, keeping at least one blank', async () => {
    const wrapper = await mountSuspended(ProductOptionsEditor, {
      props: { initial: [{ name: 'Color', namePl: '', values: [{ value: 'Red', valuePl: '' }] }] },
    })
    await wrapper.find('[data-testid="product-option-0-add-value"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(lastEmitted(wrapper)[0]!.values).toHaveLength(2)

    await wrapper.find('[data-testid="product-option-0-value-1-remove"]').trigger('click')
    await wrapper.find('[data-testid="product-option-0-value-0-remove"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    // The last value was removed — the editor keeps one blank input.
    expect(lastEmitted(wrapper)[0]!.values).toEqual([{ value: '', valuePl: '' }])
  })

  it('emits edited value text (per-value PL included)', async () => {
    const wrapper = await mountSuspended(ProductOptionsEditor, {
      props: { initial: [{ name: 'Color', namePl: '', values: [{ value: 'Red', valuePl: '' }] }] },
    })
    const vm = wrapper.vm as any
    vm.rows[0].values[0].valuePl = 'Czerwony'
    await new Promise(r => setTimeout(r, 0))

    expect(lastEmitted(wrapper)[0]!.values[0]).toEqual({ value: 'Red', valuePl: 'Czerwony' })
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductOptionsEditor, {
      props: { initial: [colorOption()] },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
