// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import ProductBulkEditToolbar from './ProductBulkEditToolbar.vue'

/**
 * The bulk-edit toolbar. We stub useBulkUpdateProducts' mutateAsync + useToast.
 * Covers: it sends only the fields the admin filled (not the untouched ones),
 * stock is never offered, toasts success + emits `applied` (→ parent clears
 * selection), and the apply button is disabled until there's a change.
 */

const { mockMutate, mockToastAdd } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useBulkUpdateProducts', () => () => ({
  mutateAsync: mockMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

// The toolbar renders inline (not a teleported modal), so query the root.
function applyButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find(
    b => b.textContent?.includes('Apply to'),
  ) as HTMLButtonElement | undefined
}

// The USD price is the first number input in the grid.
async function setUsdPrice(root: HTMLElement, value: string) {
  const input = root.querySelector('input[type="number"]') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
}

// Submit via the form (UForm runs validation, then @submit fires onApply).
async function submitForm(root: HTMLElement) {
  const form = root.querySelector('form') as HTMLFormElement
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  await flush()
}

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('ProductBulkEditToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('never offers a stock field', async () => {
    const wrapper = await mountSuspended(ProductBulkEditToolbar, { props: { productIds: [1, 2] } })
    const root = wrapper.element as HTMLElement
    expect(root.textContent?.toLowerCase()).not.toContain('stock level')
    // No "Stock" label outside the (allowed) "Low-stock threshold" control.
    const labels = [...root.querySelectorAll('label')].map(l => l.textContent?.trim())
    expect(labels).not.toContain('Stock')
  })

  it('disables apply until a field is changed', async () => {
    const wrapper = await mountSuspended(ProductBulkEditToolbar, { props: { productIds: [1, 2] } })
    expect(applyButton(wrapper.element as HTMLElement)?.disabled).toBe(true)
  })

  it('sends only the filled fields (untouched fields omitted)', async () => {
    mockMutate.mockResolvedValue({ updated: 2, product_ids: [1, 2] })
    const wrapper = await mountSuspended(ProductBulkEditToolbar, { props: { productIds: [1, 2] } })
    const root = wrapper.element as HTMLElement

    // Set only the USD price; leave the rest untouched.
    await setUsdPrice(root, '12.5')

    expect(applyButton(root)?.disabled).toBe(false)
    await submitForm(root)

    expect(mockMutate).toHaveBeenCalledWith({
      productIds: [1, 2],
      set: { price_usd: 12.5 },
    })
  })

  it('toasts success and emits applied to clear selection', async () => {
    mockMutate.mockResolvedValue({ updated: 2, product_ids: [1, 2] })
    const wrapper = await mountSuspended(ProductBulkEditToolbar, {
      props: { productIds: [1, 2] },
    })
    const root = wrapper.element as HTMLElement

    await setUsdPrice(root, '20')
    await submitForm(root)

    expect(mockMutate).toHaveBeenCalledWith({
      productIds: [1, 2],
      set: { price_usd: 20 },
    })
    expect(mockToastAdd.mock.calls.some(c => c[0].color === 'success')).toBe(true)
    expect(wrapper.emitted('applied')).toBeTruthy()
  })

  it('surfaces a 404 missing-ids / validation error', async () => {
    mockMutate.mockRejectedValue({ data: { detail: 'Products not found: 9' }, status: 404 })
    const wrapper = await mountSuspended(ProductBulkEditToolbar, {
      props: { productIds: [9] },
    })
    const root = wrapper.element as HTMLElement

    await setUsdPrice(root, '5')
    await submitForm(root)

    expect(mockToastAdd.mock.calls.some(c => c[0].color === 'error')).toBe(true)
    // Did not signal a successful apply.
    expect(wrapper.emitted('applied')).toBeFalsy()
  })
})
