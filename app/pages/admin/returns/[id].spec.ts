// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The admin return detail page renders the returned lines + request context
 * and wires the status workflow (approve/reject/receive + refund-from-return).
 * We stub the get-one query and the two mutations; the per-status action
 * gating, the transition payloads, and the refund default amount are the
 * load-bearing assertions.
 *
 * `watch`-free page, but the mock still returns real `ref()` instances
 * (the banked vitest-hoisted-ref gotcha applies to computed reads too).
 */

const RETURN = {
  id: 3,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-02T00:00:00Z',
  order_id: 7,
  user_id: 42,
  status: 'requested',
  comment: 'Arrived cracked',
  admin_note: null,
  refund_id: null,
  resolved_at: null,
  order_number: 'ORD-20260601-AAA111',
  currency: 'USD',
  customer_email: 'buyer@example.com',
  items: [
    {
      id: 91,
      return_request_id: 3,
      order_item_id: 11,
      quantity: 2,
      reason: 'defective',
      product_name: 'Widget X',
      variant_title: 'Red / L',
      unit_price: 12.5,
      line_subtotal: 25.0,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    },
  ],
}

const returnData = ref<unknown>(RETURN)
const returnError = ref<unknown>(null)
const returnLoading = ref(false)
const transitionMutate = vi.fn().mockResolvedValue({ id: 3, status: 'approved' })
const refundMutate = vi.fn().mockResolvedValue({ id: 3, status: 'refunded' })

vi.mock('~/composables/queries/useReturnQueries', () => ({
  useAdminReturnQuery: () => ({ data: returnData, error: returnError, isLoading: returnLoading }),
  useReturnTransition: () => ({ isLoading: ref(false), mutateAsync: transitionMutate }),
  useReturnRefund: () => ({ isLoading: ref(false), mutateAsync: refundMutate }),
}))

mockNuxtImport('useRoute', () => () => ({ params: { id: '3' } }))

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mockNavigate)

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', [
      slots.default?.(),
      slots.header?.(),
      slots.body?.(),
      slots.footer?.(),
    ])
  },
})

const ButtonStub = defineComponent({
  props: { ariaLabel: { type: String, default: '' } },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', {
      'aria-label': props.ariaLabel,
      'onClick': () => emit('click'),
    }, slots.default?.())
  },
})

const SelectStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: undefined } },
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', { 'data-current': props.modelValue })
  },
})

beforeEach(() => {
  returnData.value = RETURN
  returnError.value = null
  returnLoading.value = false
  transitionMutate.mockClear().mockResolvedValue({ id: 3, status: 'approved' })
  refundMutate.mockClear().mockResolvedValue({ id: 3, status: 'refunded' })
  mockNavigate.mockClear()
})

async function mountPage() {
  const Page = (await import('./[id].vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        UButton: ButtonStub,
        UCard: PassThroughStub,
        UFormField: PassThroughStub,
        UBadge: PassThroughStub,
        ULink: PassThroughStub,
        USelect: SelectStub,
        UInputNumber: true,
        UTextarea: true,
        UCheckbox: true,
        // PassThrough so the action/refund dialogs' footer buttons render
        // (the component, not the modal teleport, is under test here).
        UModal: PassThroughStub,
      },
    },
  })
}

describe('admin/returns/[id] page', () => {
  it('renders the returned lines + customer comment + order link', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('Widget X')
    expect(text).toContain('Red / L')
    expect(text).toContain('Defective item') // reason label
    expect(text).toContain('Arrived cracked')
    expect(text).toContain('ORD-20260601-AAA111')
    expect(text).toContain('buyer@example.com')
  })

  it('shows approve + reject (and no receive/refund) for a requested return', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="return-approve"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="return-reject"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="return-receive"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="return-refund"]').exists()).toBe(false)
  })

  it('shows receive + refund for an approved return', async () => {
    returnData.value = { ...RETURN, status: 'approved' }
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="return-approve"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="return-receive"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="return-refund"]').exists()).toBe(true)
  })

  it('shows only refund for a received return', async () => {
    returnData.value = { ...RETURN, status: 'received' }
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="return-receive"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="return-refund"]').exists()).toBe(true)
  })

  it('offers no actions for terminal statuses', async () => {
    returnData.value = { ...RETURN, status: 'refunded', refund_id: 5 }
    const wrapper = await mountPage()
    for (const id of ['return-approve', 'return-reject', 'return-receive', 'return-refund']) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(false)
    }
  })

  it('POSTs the approve transition with the trimmed admin note', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="return-approve"]').trigger('click')
    ;(wrapper.vm as any).adminNoteModel = '  looks legit  '
    await wrapper.find('[data-testid="return-action-confirm"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(transitionMutate).toHaveBeenCalledWith({
      id: 3,
      action: 'approve',
      adminNote: 'looks legit',
    })
  })

  it('POSTs the reject transition', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="return-reject"]').trigger('click')
    await wrapper.find('[data-testid="return-action-confirm"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(transitionMutate).toHaveBeenCalledWith({
      id: 3,
      action: 'reject',
      adminNote: null,
    })
  })

  it('defaults the refund amount to the returned-line total', async () => {
    returnData.value = { ...RETURN, status: 'received' }
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="return-refund"]').trigger('click')
    expect((wrapper.vm as any).refundAmount).toBeCloseTo(25.0)
  })

  it('POSTs the refund with amount + restock + reason', async () => {
    returnData.value = { ...RETURN, status: 'received' }
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="return-refund"]').trigger('click')
    ;(wrapper.vm as any).refundRestock = true
    await wrapper.find('[data-testid="return-refund-confirm"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(refundMutate).toHaveBeenCalledTimes(1)
    const arg = refundMutate.mock.calls[0]![0]
    expect(arg.id).toBe(3)
    expect(arg.refund).toMatchObject({
      amount: 25.0,
      restock: true,
      reason: 'customer_request',
      note: null,
    })
  })

  it('surfaces an illegal-transition 400 in the dialog', async () => {
    transitionMutate.mockRejectedValueOnce({
      data: { detail: 'Cannot approve a return in status refunded.' },
    })
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="return-approve"]').trigger('click')
    await wrapper.find('[data-testid="return-action-confirm"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.text()).toContain('Cannot approve a return in status refunded.')
  })

  it('surfaces a 404 load error via ErrorAlert', async () => {
    returnData.value = undefined
    returnError.value = { status: 404, data: { detail: 'Return request not found' } }
    const wrapper = await mountPage()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Return request not found')
  })
})
