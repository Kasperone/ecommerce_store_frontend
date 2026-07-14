// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The gift-card detail page renders the card summary + ledger and wires three
 * actions: the status toggle (immediate PATCH), the edit modal (expires_at /
 * note — explicit null clears), and the signed adjust with its
 * `gift_card_balance_negative` machine-code mapping. Those payload/error
 * contracts are the load-bearing assertions (returns-detail spec pattern).
 */

const CARD = {
  id: 5,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
  last4: '7QK2',
  initial_value: 100,
  balance: 60,
  currency: 'PLN',
  status: 'active',
  expires_at: null,
  recipient_email: 'gift@example.com',
  user_id: 42,
  note: 'VIP thank-you',
  entries: [
    {
      id: 12,
      amount: -40,
      kind: 'redeem',
      balance_after: 60,
      order_id: 7,
      actor_user_id: null,
      note: null,
      created_at: '2026-07-02T00:00:00Z',
    },
    {
      id: 11,
      amount: 100,
      kind: 'issue',
      balance_after: 100,
      order_id: null,
      actor_user_id: 1,
      note: null,
      created_at: '2026-07-01T00:00:00Z',
    },
  ],
}

const cardData = ref<unknown>(CARD)
const cardError = ref<unknown>(null)
const cardLoading = ref(false)
const updateMutate = vi.fn()
const adjustMutate = vi.fn()

vi.mock('~/composables/queries/useGiftCardQueries', () => ({
  useGiftCardQuery: () => ({ data: cardData, error: cardError, isLoading: cardLoading }),
  useUpdateGiftCard: () => ({ isLoading: ref(false), mutateAsync: updateMutate }),
  useAdjustGiftCard: () => ({ isLoading: ref(false), mutateAsync: adjustMutate }),
}))

mockNuxtImport('useRoute', () => () => ({ params: { id: '5' } }))

const { mockNavigate, toastAdd } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  toastAdd: vi.fn(),
}))
mockNuxtImport('navigateTo', () => mockNavigate)
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

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

beforeEach(() => {
  cardData.value = CARD
  cardError.value = null
  cardLoading.value = false
  updateMutate.mockClear().mockResolvedValue({ ...CARD, entries: undefined })
  adjustMutate.mockClear().mockResolvedValue(CARD)
  mockNavigate.mockClear()
  toastAdd.mockClear()
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
        UInput: true,
        UInputNumber: true,
        UTextarea: true,
        // PassThrough so the edit/adjust modal footers render (the component,
        // not the modal teleport, is under test here).
        UModal: PassThroughStub,
      },
    },
  })
}

const tick = () => new Promise(r => setTimeout(r, 0))

describe('admin/gift-cards/[id] page', () => {
  it('renders the summary (masked code, recipient, note) and the ledger', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('•••• 7QK2')
    expect(text).toContain('gift@example.com')
    expect(text).toContain('VIP thank-you')
    // Ledger kinds, newest first straight from the API.
    expect(text).toContain('Redemption')
    expect(text).toContain('Issue')
    expect(wrapper.find('[data-testid="gift-card-entry-12"]').exists()).toBe(true)
  })

  it('shows the ledger empty state when there are no entries', async () => {
    cardData.value = { ...CARD, entries: [] }
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No movements yet.')
  })

  it('shows the derived Expired badge for a card past its expiry', async () => {
    cardData.value = { ...CARD, expires_at: '2020-01-01T00:00:00Z' }
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="gift-card-expired-badge"]').exists()).toBe(true)
  })

  it('PATCHes status=disabled from the toggle on an active card', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="gift-card-toggle-status"]').trigger('click')
    await tick()

    expect(updateMutate).toHaveBeenCalledWith({ id: 5, patch: { status: 'disabled' } })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('PATCHes status=active from the toggle on a disabled card', async () => {
    cardData.value = { ...CARD, status: 'disabled' }
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="gift-card-toggle-status"]').trigger('click')
    await tick()

    expect(updateMutate).toHaveBeenCalledWith({ id: 5, patch: { status: 'active' } })
  })

  it('PATCHes the trimmed note and null expires_at when the edit clears the date', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="gift-card-edit"]').trigger('click')
    ;(wrapper.vm as any).editExpiresAt = ''
    ;(wrapper.vm as any).editNote = '  updated note  '
    await wrapper.find('[data-testid="gift-card-edit-confirm"]').trigger('click')
    await tick()

    expect(updateMutate).toHaveBeenCalledWith({
      id: 5,
      patch: { expires_at: null, note: 'updated note' },
    })
  })

  it('POSTs the signed adjust amount with the note', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="gift-card-adjust"]').trigger('click')
    ;(wrapper.vm as any).adjustAmount = -20
    ;(wrapper.vm as any).adjustNote = 'claw-back'
    await wrapper.find('[data-testid="gift-card-adjust-confirm"]').trigger('click')
    await tick()

    expect(adjustMutate).toHaveBeenCalledWith({
      id: 5,
      body: { amount: -20, note: 'claw-back' },
    })
  })

  it('blocks a zero/empty adjust client-side', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="gift-card-adjust"]').trigger('click')
    await wrapper.find('[data-testid="gift-card-adjust-confirm"]').trigger('click')
    await tick()

    expect(adjustMutate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Amount must be a non-zero number.')
  })

  it('maps the gift_card_balance_negative machine code to readable copy', async () => {
    adjustMutate.mockRejectedValueOnce({
      status: 400,
      data: { detail: 'gift_card_balance_negative' },
    })
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="gift-card-adjust"]').trigger('click')
    ;(wrapper.vm as any).adjustAmount = -999
    await wrapper.find('[data-testid="gift-card-adjust-confirm"]').trigger('click')
    await tick()

    expect(wrapper.text()).toContain('This adjustment would take the balance below zero.')
    expect(wrapper.text()).not.toContain('gift_card_balance_negative')
  })

  it('surfaces a 404 load error via ErrorAlert', async () => {
    cardData.value = undefined
    cardError.value = { status: 404, data: { detail: 'Gift card not found' } }
    const wrapper = await mountPage()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Gift card not found')
  })
})
