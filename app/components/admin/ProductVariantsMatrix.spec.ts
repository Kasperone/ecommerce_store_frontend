// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductVariantsMatrix from './ProductVariantsMatrix.vue'
import type { OptionDraft, VariantRowDraft } from '~/composables/queries/useVariantQueries'
import type { ProductImageResponse } from '#shared/types/api'

/**
 * Cartesian matrix editor (variants F1). Rows derive from the option drafts;
 * existing rows are matched by combination and keep their id/SKU/prices.
 * Body assembly is pinned in useVariantQueries.spec.ts (buildMatrixBody).
 */

const AXE_OPTIONS = {
  rules: {
    region: { enabled: false },
  },
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function colorSizeOptions(): OptionDraft[] {
  return [
    { name: 'Color', namePl: '', values: [{ value: 'Red', valuePl: '' }, { value: 'Blue', valuePl: '' }] },
    { name: 'Size', namePl: '', values: [{ value: 'M', valuePl: '' }, { value: 'XL', valuePl: '' }] },
  ]
}

function existingRow(overrides: Partial<VariantRowDraft> = {}): VariantRowDraft {
  return {
    id: 100,
    optionValues: ['Red', 'M'],
    sku: 'SKU-RED-M',
    priceUsd: 19.99,
    pricePln: null,
    priceEur: null,
    imageId: null,
    isActive: true,
    initialStock: null,
    stock: 7,
    ...overrides,
  }
}

function image(id: number): ProductImageResponse {
  return {
    id,
    created_at: '2026-06-07T10:00:00',
    updated_at: '2026-06-07T10:00:00',
    product_id: 5,
    url: `https://r2.example/img-${id}.jpg`,
    alt_text: `Image ${id}`,
    is_primary: id === 1,
    sort_order: id,
    width: 100,
    height: 100,
    bytes: 1234,
    // The API field is `mime`, not `content_type`. The old name plus the
    // `as ProductImageResponse` cast hid the mismatch: the import was broken,
    // so the cast target was an error type and asserted nothing.
    mime: 'image/jpeg',
  }
}

function lastEmitted(wrapper: any): VariantRowDraft[] {
  const emitted = wrapper.emitted('update:rows') as [VariantRowDraft[]][] | undefined
  expect(emitted).toBeTruthy()
  return emitted![emitted!.length - 1]![0]
}

async function mountMatrix(props: Partial<InstanceType<typeof ProductVariantsMatrix>['$props']> = {}) {
  return mountSuspended(ProductVariantsMatrix, {
    props: {
      options: colorSizeOptions(),
      initialRows: [],
      productPriceUsd: 9.99,
      productPricePln: 39.99,
      productPriceEur: 8.99,
      images: [],
      ...props,
    },
  })
}

describe('AdminProductVariantsMatrix', () => {
  it('generates the cartesian rows from the options', async () => {
    const wrapper = await mountMatrix()
    const rows = lastEmitted(wrapper)
    expect(rows.map(r => r.optionValues)).toEqual([
      ['Red', 'M'],
      ['Red', 'XL'],
      ['Blue', 'M'],
      ['Blue', 'XL'],
    ])
    // All new — blank drafts with inherit prices.
    expect(rows.every(r => r.id === null && r.priceUsd === null)).toBe(true)
  })

  it('preserves existing rows by combination and adds blanks for new combos', async () => {
    const wrapper = await mountMatrix({ initialRows: [existingRow()] })
    const rows = lastEmitted(wrapper)
    expect(rows).toHaveLength(4)
    const kept = rows.find(r => r.optionValues.join(' ') === 'Red M')
    expect(kept).toMatchObject({ id: 100, sku: 'SKU-RED-M', priceUsd: 19.99, stock: 7 })
    expect(rows.filter(r => r.id === null)).toHaveLength(3)
  })

  it('shows an initial-stock input for NEW rows and read-only stock for existing ones', async () => {
    const wrapper = await mountMatrix({ initialRows: [existingRow()] })
    // Row 0 is the existing Red/M — read-only stock, no initial-stock input.
    expect(wrapper.find('[data-testid="variant-row-0-stock"]').text()).toBe('7')
    expect(wrapper.find('[data-testid="variant-row-0-initial-stock"]').exists()).toBe(false)
    // Row 1 (Red/XL) is new — initial-stock input, no read-only stock.
    expect(wrapper.find('[data-testid="variant-row-1-initial-stock"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="variant-row-1-stock"]').exists()).toBe(false)
  })

  it('removing a row excludes its combination and the cartesian sync does not resurrect it', async () => {
    const wrapper = await mountMatrix()
    await wrapper.find('[data-testid="variant-row-0-remove"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(lastEmitted(wrapper).map(r => r.optionValues.join(' '))).toEqual([
      'Red XL',
      'Blue M',
      'Blue XL',
    ])

    // Re-trigger the options watcher — the dismissed combo must stay gone.
    await wrapper.setProps({ options: colorSizeOptions() })
    await new Promise(r => setTimeout(r, 0))
    expect(lastEmitted(wrapper)).toHaveLength(3)
  })

  it('re-syncs the rows when the options change', async () => {
    const wrapper = await mountMatrix()
    await wrapper.setProps({
      options: [
        { name: 'Color', namePl: '', values: [{ value: 'Red', valuePl: '' }] },
      ],
    })
    await new Promise(r => setTimeout(r, 0))
    expect(lastEmitted(wrapper).map(r => r.optionValues)).toEqual([['Red']])
  })

  it('shows the empty state when no option has a name and a value', async () => {
    const wrapper = await mountMatrix({ options: [] })
    expect(wrapper.find('[data-testid="variants-empty"]').exists()).toBe(true)
    expect(lastEmitted(wrapper)).toEqual([])
  })

  it('warns when the combinations exceed the 100-variant server cap', async () => {
    const wrapper = await mountMatrix({
      options: [
        {
          name: 'A',
          namePl: '',
          values: Array.from({ length: 11 }, (_, i) => ({ value: `a${i}`, valuePl: '' })),
        },
        {
          name: 'B',
          namePl: '',
          values: Array.from({ length: 10 }, (_, i) => ({ value: `b${i}`, valuePl: '' })),
        },
      ],
    })
    expect(lastEmitted(wrapper)).toHaveLength(110)
    expect(wrapper.find('[data-testid="variants-over-cap"]').exists()).toBe(true)
    // 110 mounted rows take ~20s on the shared CI runner — give this spec headroom.
  }, 60_000)

  it('picks a gallery image for a row (and clears it)', async () => {
    const wrapper = await mountMatrix({ images: [image(1), image(2)] })
    const vm = wrapper.vm as any
    vm.pickImage(0, 2)
    await new Promise(r => setTimeout(r, 0))
    expect(lastEmitted(wrapper)[0]!.imageId).toBe(2)

    vm.pickImage(0, null)
    await new Promise(r => setTimeout(r, 0))
    expect(lastEmitted(wrapper)[0]!.imageId).toBeNull()
  })

  it('is axe-clean', async () => {
    const wrapper = await mountMatrix({ initialRows: [existingRow()], images: [image(1)] })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
