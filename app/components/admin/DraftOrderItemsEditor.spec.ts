// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import DraftOrderItemsEditor from './DraftOrderItemsEditor.vue'
import type { DraftOrderResponse } from '~/composables/queries/useDraftOrderQueries'

/**
 * The items editor owns the product-picker search query, the variants query,
 * and the add/update/remove item mutations, so we stub those auto-imports and
 * assert the editor's own rendering + add/save/remove flows. URL/verb mapping
 * is pinned in useDraftOrderQueries.spec-style tests via the composable layer;
 * here we only assert the payloads the editor assembles.
 *
 * `mocks` holds plain values in vi.hoisted (the factories run after the `vue`
 * import, so `ref()` is created inside them, not in hoisted).
 */

const mocks = vi.hoisted(() => ({
  products: [] as unknown[],
  variants: [] as unknown[],
  addMutate: vi.fn(),
  updateMutate: vi.fn(),
  removeMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useProductsQuery', () => () => ({
  data: ref({ items: mocks.products, total: mocks.products.length, page: 1, page_size: 10, pages: 1 }),
  isLoading: ref(false),
  error: ref(null),
}))
mockNuxtImport('useProductVariantsQuery', () => () => ({
  data: ref(mocks.variants),
  isLoading: ref(false),
  error: ref(null),
}))
mockNuxtImport('useAddDraftOrderItem', () => () => ({ mutateAsync: mocks.addMutate, isLoading: ref(false) }))
mockNuxtImport('useUpdateDraftOrderItem', () => () => ({ mutateAsync: mocks.updateMutate, isLoading: ref(false) }))
mockNuxtImport('useRemoveDraftOrderItem', () => () => ({ mutateAsync: mocks.removeMutate, isLoading: ref(false) }))
mockNuxtImport('useToast', () => () => ({ add: mocks.toastAdd }))

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    draft_order_id: 1,
    product_id: 5,
    variant_id: null,
    product_name: 'Blue Mug',
    variant_title: null,
    quantity: 2,
    unit_price_override: null,
    effective_unit_price: 10,
    line_total: 20,
    created_at: '2026-07-13T10:00:00',
    updated_at: '2026-07-13T10:00:00',
    ...overrides,
  }
}

function draft(overrides: Record<string, unknown> = {}): DraftOrderResponse {
  return {
    id: 1,
    user_id: null,
    guest_email: 'guest@example.com',
    customer_email: null,
    status: 'open',
    currency: 'USD',
    shipping_address: null,
    shipping_city: null,
    shipping_postal_code: null,
    shipping_country: null,
    shipping_method_id: null,
    discount: 0,
    subtotal: 20,
    total: 20,
    notes: null,
    converted_order_id: null,
    items: [item()],
    created_at: '2026-07-13T10:00:00',
    updated_at: '2026-07-13T10:00:00',
    ...overrides,
  } as DraftOrderResponse
}

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

beforeEach(() => {
  mocks.products = []
  mocks.variants = []
  mocks.addMutate.mockReset().mockResolvedValue({})
  mocks.updateMutate.mockReset().mockResolvedValue({})
  mocks.removeMutate.mockReset().mockResolvedValue({})
  mocks.toastAdd.mockReset()
  document.body.innerHTML = ''
})

describe('DraftOrderItemsEditor (AdminDraftOrderItemsEditor)', () => {
  it('shows the empty state when the draft has no lines', async () => {
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft({ items: [], subtotal: 0, total: 0 }) },
    })
    expect(wrapper.find('[data-testid="draft-order-items-empty"]').exists()).toBe(true)
  })

  it('renders lines with server-computed money and the totals block', async () => {
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft({ discount: 5, total: 15 }) },
    })
    expect(wrapper.text()).toContain('Blue Mug')
    expect(wrapper.find('[data-testid="draft-order-item-11-total"]').text()).toContain('20')
    expect(wrapper.find('[data-testid="draft-order-subtotal"]').text()).toContain('20')
    expect(wrapper.find('[data-testid="draft-order-discount"]').text()).toContain('5')
    expect(wrapper.find('[data-testid="draft-order-total"]').text()).toContain('15')
  })

  it('marks a line referencing a deleted product as stale', async () => {
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft({ items: [item({ product_name: null, product_id: null })] }) },
    })
    expect(wrapper.text()).toContain('Deleted product')
  })

  it('hides the picker and row controls when disabled (completed draft)', async () => {
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft({ status: 'completed' }), disabled: true },
    })
    expect(wrapper.find('[data-testid="draft-order-product-search"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="draft-order-item-11-remove"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Qty: 2')
  })

  it('searches, picks a product without variants, and adds a line', async () => {
    mocks.products = [{ id: 7, name: 'Red Cap' }]
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft() },
    })

    await wrapper.find('[data-testid="draft-order-product-search"] input, input[data-testid="draft-order-product-search"]').setValue('cap')
    // The search term is debounced 300ms before the results render.
    await new Promise(r => setTimeout(r, 350))
    await wrapper.vm.$nextTick()

    const candidate = wrapper.find('[data-testid="draft-order-product-7"]')
    expect(candidate.exists()).toBe(true)
    await candidate.trigger('click')
    await flush()

    expect(wrapper.find('[data-testid="draft-order-picked-name"]').text()).toBe('Red Cap')
    // No active variants → no variant select required.
    expect(wrapper.find('[data-testid="draft-order-variant-select"]').exists()).toBe(false)

    await wrapper.find('[data-testid="draft-order-add-item"]').trigger('click')
    await flush()

    expect(mocks.addMutate).toHaveBeenCalledWith({
      draftId: 1,
      body: { product_id: 7, variant_id: null, quantity: 1, unit_price_override: null },
    })
  })

  it('sends a numeric unit_price_override when the admin fills one in', async () => {
    mocks.products = [{ id: 7, name: 'Red Cap' }]
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft() },
    })

    await wrapper.find('[data-testid="draft-order-product-search"] input, input[data-testid="draft-order-product-search"]').setValue('cap')
    await new Promise(r => setTimeout(r, 350))
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="draft-order-product-7"]').trigger('click')
    await flush()

    await wrapper.find('[data-testid="draft-order-add-override"] input, input[data-testid="draft-order-add-override"]').setValue('12.5')
    await wrapper.find('[data-testid="draft-order-add-item"]').trigger('click')
    await flush()

    expect(mocks.addMutate).toHaveBeenCalledWith({
      draftId: 1,
      body: { product_id: 7, variant_id: null, quantity: 1, unit_price_override: 12.5 },
    })
  })

  it('requires a variant before adding when the product has active variants', async () => {
    mocks.products = [{ id: 7, name: 'Red Cap' }]
    mocks.variants = [
      { id: 71, title: 'S', sku: null, is_active: true },
      { id: 72, title: 'M', sku: 'CAP-M', is_active: true },
      { id: 73, title: 'XL', sku: null, is_active: false },
    ]
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft() },
    })

    await wrapper.find('[data-testid="draft-order-product-search"] input, input[data-testid="draft-order-product-search"]').setValue('cap')
    await new Promise(r => setTimeout(r, 350))
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="draft-order-product-7"]').trigger('click')
    await flush()

    expect(wrapper.find('[data-testid="draft-order-variant-select"]').exists()).toBe(true)
    // Add is disabled until a variant is picked; the click must not mutate.
    await wrapper.find('[data-testid="draft-order-add-item"]').trigger('click')
    await flush()
    expect(mocks.addMutate).not.toHaveBeenCalled()
  })

  it('saves an edited row with an explicit null override to clear the pin', async () => {
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft({ items: [item({ unit_price_override: 9 })] }) },
    })

    const override = wrapper.find('[data-testid="draft-order-item-11-override"] input, input[data-testid="draft-order-item-11-override"]')
    await override.setValue('')
    await flush()

    const save = wrapper.find('[data-testid="draft-order-item-11-save"]')
    expect(save.exists()).toBe(true)
    await save.trigger('click')
    await flush()

    expect(mocks.updateMutate).toHaveBeenCalledWith({
      draftId: 1,
      itemId: 11,
      patch: { quantity: 2, unit_price_override: null },
    })
  })

  it('removes a line', async () => {
    const wrapper = await mountSuspended(DraftOrderItemsEditor, {
      props: { draft: draft() },
    })
    await wrapper.find('[data-testid="draft-order-item-11-remove"]').trigger('click')
    await flush()
    expect(mocks.removeMutate).toHaveBeenCalledWith({ draftId: 1, itemId: 11 })
  })
})
