// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import QuoteLineItemsEditor from './QuoteLineItemsEditor.vue'
import type { QuoteItemCreate } from '~/composables/queries/useQuoteQueries'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function lastEmitted(wrapper: any): QuoteItemCreate[] {
  const emitted = wrapper.emitted('update:items') as [QuoteItemCreate[]][] | undefined
  expect(emitted).toBeTruthy()
  return emitted![emitted!.length - 1]![0]
}

describe('AdminQuoteLineItemsEditor', () => {
  it('seeds one blank row and emits an empty body on mount when items is empty', async () => {
    const wrapper = await mountSuspended(QuoteLineItemsEditor, {
      props: { items: [], currency: 'USD' },
    })
    // One row rendered, but the body is empty (blank description is dropped).
    expect(wrapper.findAll('[data-testid^="quote-line-0"]').length).toBeGreaterThan(0)
    expect(lastEmitted(wrapper)).toEqual([])
  })

  it('emits the assembled items body when a row is filled in', async () => {
    const wrapper = await mountSuspended(QuoteLineItemsEditor, {
      props: { items: [], currency: 'USD' },
    })
    const vm = wrapper.vm as any
    vm.rows[0].description = 'Consulting'
    vm.rows[0].quantity = 3
    vm.rows[0].unitPrice = 50
    await new Promise(r => setTimeout(r, 0))

    expect(lastEmitted(wrapper)).toEqual([
      { description: 'Consulting', quantity: 3, unit_price: 50, product_id: null },
    ])
  })

  it('seeds rows from incoming items (edit mode)', async () => {
    const wrapper = await mountSuspended(QuoteLineItemsEditor, {
      props: {
        items: [
          { description: 'Line A', quantity: 2, unit_price: 10, product_id: null },
          { description: 'Line B', quantity: 1, unit_price: 5, product_id: null },
        ],
        currency: 'USD',
      },
    })
    const emitted = lastEmitted(wrapper)
    expect(emitted).toHaveLength(2)
    expect(emitted[0]).toMatchObject({ description: 'Line A', quantity: 2, unit_price: 10 })
  })

  it('adds and removes rows', async () => {
    const wrapper = await mountSuspended(QuoteLineItemsEditor, {
      props: { items: [], currency: 'USD' },
    })
    const vm = wrapper.vm as any
    expect(vm.rows).toHaveLength(1)

    vm.addRow()
    await new Promise(r => setTimeout(r, 0))
    expect(vm.rows).toHaveLength(2)

    vm.removeRow(0)
    await new Promise(r => setTimeout(r, 0))
    expect(vm.rows).toHaveLength(1)
  })

  it('keeps at least one row after removing the last one', async () => {
    const wrapper = await mountSuspended(QuoteLineItemsEditor, {
      props: { items: [], currency: 'USD' },
    })
    const vm = wrapper.vm as any
    vm.removeRow(0)
    await new Promise(r => setTimeout(r, 0))
    expect(vm.rows).toHaveLength(1)
  })

  it('renders the running subtotal for the chosen currency', async () => {
    const wrapper = await mountSuspended(QuoteLineItemsEditor, {
      props: {
        items: [{ description: 'X', quantity: 2, unit_price: 25, product_id: null }],
        currency: 'USD',
      },
    })
    const subtotal = wrapper.find('[data-testid="quote-line-subtotal"]')
    expect(subtotal.exists()).toBe(true)
    // 2 × 25 = 50.
    expect(subtotal.text()).toMatch(/50/)
  })

  it('drops empty (description-less) rows from the emitted body', async () => {
    const wrapper = await mountSuspended(QuoteLineItemsEditor, {
      props: { items: [], currency: 'USD' },
    })
    const vm = wrapper.vm as any
    vm.rows[0].description = 'Kept'
    vm.addRow() // a second, blank row
    await new Promise(r => setTimeout(r, 0))
    const emitted = lastEmitted(wrapper)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.description).toBe('Kept')
  })
})
