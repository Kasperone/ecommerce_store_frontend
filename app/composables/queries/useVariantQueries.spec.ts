import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { ProductOptionResponse, ProductVariantResponse } from '#shared/types/api'

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function runInComponent(setupFn: () => unknown) {
  let captured: unknown
  const harness = defineComponent({
    setup() {
      captured = setupFn()
      return () => h('div')
    },
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  mount(harness, {
    global: {
      plugins: [pinia, PiniaColada],
    },
  })
  await nextTick()
  return captured
}

function option(overrides: Partial<ProductOptionResponse> = {}): ProductOptionResponse {
  return {
    id: 1,
    created_at: '2026-06-07T10:00:00',
    updated_at: '2026-06-07T10:00:00',
    product_id: 5,
    name: 'Color',
    name_pl: 'Kolor',
    position: 0,
    values: [
      {
        id: 11, created_at: '2026-06-07T10:00:00', updated_at: '2026-06-07T10:00:00',
        option_id: 1, value: 'Red', value_pl: 'Czerwony', position: 0,
      },
      {
        id: 12, created_at: '2026-06-07T10:00:00', updated_at: '2026-06-07T10:00:00',
        option_id: 1, value: 'Blue', value_pl: null, position: 1,
      },
    ],
    ...overrides,
  }
}

function variant(overrides: Partial<ProductVariantResponse> = {}): ProductVariantResponse {
  return {
    id: 100,
    created_at: '2026-06-07T10:00:00',
    updated_at: '2026-06-07T10:00:00',
    product_id: 5,
    title: 'Red',
    title_pl: 'Czerwony',
    sku: 'SKU-RED',
    price_usd: 19.99,
    price_pln: null,
    price_eur: null,
    stock: 7,
    image_id: 42,
    position: 0,
    is_active: true,
    option_value_ids: [11],
    ...overrides,
  }
}

describe('useProductVariantsQuery', () => {
  it('GETs /api/v1/products/{id}/variants', async () => {
    apiFetch.mockResolvedValue([variant()])
    const { useProductVariantsQuery } = await import('./useVariantQueries')

    await runInComponent(() => useProductVariantsQuery(5))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/products/5/variants')
  })

  it('does not fetch when the product id is undefined', async () => {
    const { useProductVariantsQuery } = await import('./useVariantQueries')

    await runInComponent(() => useProductVariantsQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useUpdateOptionsMatrix', () => {
  it('PUTs the matrix body to /api/v1/products/{id}/options', async () => {
    apiFetch.mockResolvedValue({ options: [], variants: [] })
    const { useUpdateOptionsMatrix } = await import('./useVariantQueries')

    const matrix = {
      options: [{ name: 'Color', name_pl: null, position: 0, values: [{ value: 'Red', value_pl: null, position: 0 }] }],
      variants: [{
        id: null, option_values: ['Red'], sku: null, price_usd: null, price_pln: null,
        price_eur: null, image_id: null, is_active: true, position: 0, initial_stock: 3,
      }],
    }
    const result = await runInComponent(() => useUpdateOptionsMatrix()) as any
    await result.mutateAsync({ productId: 5, matrix })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/products/5/options')
    expect(options.method).toBe('PUT')
    expect(options.body).toEqual(matrix)
  })
})

describe('optionsToDrafts', () => {
  it('maps options + values sorted by position, defaulting PL to empty string', async () => {
    const { optionsToDrafts } = await import('./useVariantQueries')
    const drafts = optionsToDrafts([
      option({ id: 2, name: 'Size', name_pl: null, position: 1, values: [
        {
          id: 21, created_at: '2026-06-07T10:00:00', updated_at: '2026-06-07T10:00:00',
          option_id: 2, value: 'XL', value_pl: null, position: 0,
        },
      ] }),
      option(),
    ])
    expect(drafts).toEqual([
      {
        name: 'Color',
        namePl: 'Kolor',
        values: [
          { value: 'Red', valuePl: 'Czerwony' },
          { value: 'Blue', valuePl: '' },
        ],
      },
      { name: 'Size', namePl: '', values: [{ value: 'XL', valuePl: '' }] },
    ])
  })
})

describe('variantsToDrafts', () => {
  it('resolves option_value_ids to EN value strings in option order', async () => {
    const { variantsToDrafts } = await import('./useVariantQueries')
    const size = option({
      id: 2,
      name: 'Size',
      position: 1,
      values: [
        {
          id: 21, created_at: '2026-06-07T10:00:00', updated_at: '2026-06-07T10:00:00',
          option_id: 2, value: 'XL', value_pl: null, position: 0,
        },
      ],
    })
    const drafts = variantsToDrafts(
      // ids arrive unordered — resolution must follow OPTION order, not id order.
      [variant({ option_value_ids: [21, 11] })],
      [size, option()],
    )
    expect(drafts).toEqual([{
      id: 100,
      optionValues: ['Red', 'XL'],
      sku: 'SKU-RED',
      priceUsd: 19.99,
      pricePln: null,
      priceEur: null,
      imageId: 42,
      isActive: true,
      initialStock: null,
      stock: 7,
    }])
  })

  it('sorts rows by variant position', async () => {
    const { variantsToDrafts } = await import('./useVariantQueries')
    const drafts = variantsToDrafts(
      [
        variant({ id: 101, position: 1, option_value_ids: [12] }),
        variant({ id: 100, position: 0, option_value_ids: [11] }),
      ],
      [option()],
    )
    expect(drafts.map(d => d.id)).toEqual([100, 101])
  })
})

describe('buildMatrixBody', () => {
  it('assembles the PUT body with index-derived positions and trimmed strings', async () => {
    const { buildMatrixBody } = await import('./useVariantQueries')
    const body = buildMatrixBody(
      [
        {
          name: ' Color ',
          namePl: '',
          values: [
            { value: 'Red', valuePl: ' Czerwony ' },
            { value: '   ', valuePl: '' }, // blank value dropped
          ],
        },
        { name: '', namePl: '', values: [{ value: 'X', valuePl: '' }] }, // unnamed option dropped
      ],
      [
        {
          id: 100,
          optionValues: ['Red'],
          sku: ' SKU-RED ',
          priceUsd: 19.99,
          pricePln: null,
          priceEur: null,
          imageId: 42,
          isActive: true,
          initialStock: 9, // ignored — existing row
          stock: 7,
        },
        {
          id: null,
          optionValues: ['Blue'],
          sku: '',
          priceUsd: null,
          pricePln: null,
          priceEur: null,
          imageId: null,
          isActive: false,
          initialStock: 5,
          stock: null,
        },
      ],
    )
    expect(body).toEqual({
      options: [
        {
          name: 'Color',
          name_pl: null,
          position: 0,
          values: [{ value: 'Red', value_pl: 'Czerwony', position: 0 }],
        },
      ],
      variants: [
        {
          id: 100,
          option_values: ['Red'],
          sku: 'SKU-RED',
          price_usd: 19.99,
          price_pln: null,
          price_eur: null,
          image_id: 42,
          is_active: true,
          position: 0,
          initial_stock: null,
        },
        {
          id: null,
          option_values: ['Blue'],
          sku: null,
          price_usd: null,
          price_pln: null,
          price_eur: null,
          image_id: null,
          is_active: false,
          position: 1,
          initial_stock: 5,
        },
      ],
    })
  })
})
