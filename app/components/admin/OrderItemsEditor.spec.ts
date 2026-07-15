// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import OrderItemsEditor from './OrderItemsEditor.vue'

/**
 * The editor seeds local line state from the order, previews totals, and sends
 * ONE PATCH /orders/{id}/items on save. We stub the mutation + the picker/
 * shipping queries and assert: seed render + subtotal preview, the save payload
 * (WYSIWYG unit_price_override + discount + shipping_method_id), line removal,
 * and the 409 "not editable" mapping.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    editMutate: vi.fn(),
    toastAdd: vi.fn(),
  },
}))

mockNuxtImport('useEditOrderItems', () => () => ({
  mutateAsync: mocks.editMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useShippingMethodsQuery', () => () => ({
  data: ref({ items: [{ id: 1, name: 'Standard' }, { id: 2, name: 'Express' }] }),
  isLoading: ref(false),
}))
mockNuxtImport('useProductsQuery', () => () => ({
  data: ref({ items: [] }),
  isLoading: ref(false),
}))
mockNuxtImport('useProductVariantsQuery', () => () => ({
  data: ref([]),
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mocks.toastAdd }))

const ORDER = {
  id: 42,
  currency: 'USD',
  status: 'pending',
  discount: 0,
  shipping: 5,
  shipping_method_id: 1,
  items: [
    {
      id: 1,
      product_id: 10,
      variant_id: null,
      product_name: 'Widget',
      variant_title: null,
      unit_price: 20,
      quantity: 2,
    },
    {
      id: 2,
      product_id: 11,
      variant_id: null,
      product_name: 'Gadget',
      variant_title: null,
      unit_price: 5,
      quantity: 1,
    },
  ],
}

beforeEach(() => {
  mocks.editMutate.mockReset().mockResolvedValue({})
  mocks.toastAdd.mockReset()
})

function mount(order: any = ORDER) {
  return mountSuspended(OrderItemsEditor, { props: { order } })
}

describe('OrderItemsEditor', () => {
  it('seeds lines from the order and previews the subtotal', async () => {
    const wrapper = await mount()
    const text = wrapper.text()
    expect(text).toContain('Widget')
    expect(text).toContain('Gadget')
    // subtotal = 2x20 + 1x5 = 45
    expect(wrapper.find('[data-testid="order-edit-subtotal"]').text()).toContain('45')
    // total preview = 45 - 0 + 5 shipping = 50
    expect(wrapper.find('[data-testid="order-edit-total"]').text()).toContain('50')
  })

  it('sends the full line set + discount + shipping on save (WYSIWYG override)', async () => {
    const wrapper = await mount()
    await wrapper.find('[data-testid="order-edit-save"]').trigger('click')
    expect(mocks.editMutate).toHaveBeenCalledTimes(1)
    expect(mocks.editMutate).toHaveBeenCalledWith({
      orderId: 42,
      edit: {
        lines: [
          { product_id: 10, variant_id: null, quantity: 2, unit_price_override: 20 },
          { product_id: 11, variant_id: null, quantity: 1, unit_price_override: 5 },
        ],
        discount: 0,
        shipping_method_id: 1,
      },
    })
  })

  it('removes a line and updates the preview', async () => {
    const wrapper = await mount()
    await wrapper.find('[data-testid="order-edit-remove-11"]').trigger('click')
    expect(wrapper.text()).not.toContain('Gadget')
    // subtotal now just 2x20 = 40
    expect(wrapper.find('[data-testid="order-edit-subtotal"]').text()).toContain('40')
  })

  it('maps a 409 to the not-editable message', async () => {
    mocks.editMutate.mockRejectedValue({ status: 409, data: { detail: 'Order is not editable in status \'paid\'' } })
    const wrapper = await mount()
    await wrapper.find('[data-testid="order-edit-save"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('no longer be edited')
  })

  it('emits saved on a successful save', async () => {
    const wrapper = await mount()
    await wrapper.find('[data-testid="order-edit-save"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('saved')).toBeTruthy()
  })
})
