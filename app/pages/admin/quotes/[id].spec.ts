// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The quote detail page renders the nested line items + totals and wires the
 * status/notes/valid-until edit (PATCH) + delete. We stub the get-one query, the
 * update/delete mutations, and the Nuxt UI components. The PATCH payload and the
 * 404 load-error surface are the load-bearing assertions.
 *
 * `watch(quote, …, { immediate: true })` runs over a real `ref`, so the mock
 * returns real `ref()` instances (the banked vitest-hoisted-ref gotcha).
 */

const QUOTE = {
  id: 9,
  created_at: '2026-05-30T00:00:00Z',
  updated_at: '2026-05-30T00:00:00Z',
  company_id: 3,
  company_name: 'Acme Corp',
  status: 'sent',
  currency: 'USD',
  valid_until: '2026-12-31',
  notes: 'Net 30',
  subtotal: 250,
  total: 250,
  items: [
    {
      id: 1,
      created_at: '2026-05-30T00:00:00Z',
      updated_at: '2026-05-30T00:00:00Z',
      quote_id: 9,
      product_id: null,
      description: 'Consulting block',
      quantity: 5,
      unit_price: 50,
      line_total: 250,
    },
  ],
}

const quoteData = ref<unknown>(QUOTE)
const quoteError = ref<unknown>(null)
const quoteLoading = ref(false)
const updateMutate = vi.fn().mockResolvedValue({ id: 9 })
const deleteMutate = vi.fn().mockResolvedValue(null)

vi.mock('~/composables/queries/useQuoteQueries', () => ({
  useQuoteQuery: () => ({ data: quoteData, error: quoteError, isLoading: quoteLoading }),
  useUpdateQuote: () => ({ isLoading: ref(false), mutateAsync: updateMutate }),
  useDeleteQuote: () => ({ isLoading: ref(false), mutateAsync: deleteMutate }),
}))

mockNuxtImport('useRoute', () => () => ({ params: { id: '9' } }))

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

// USelect stub: renders a <select>-ish element and exposes update:modelValue.
const SelectStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: undefined } },
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', { 'data-current': props.modelValue })
  },
})

beforeEach(() => {
  quoteData.value = QUOTE
  quoteError.value = null
  quoteLoading.value = false
  updateMutate.mockClear()
  deleteMutate.mockClear()
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
        USelect: SelectStub,
        UInput: true,
        UTextarea: true,
        UModal: true,
      },
    },
  })
}

describe('admin/quotes/[id] page', () => {
  it('renders the nested line items', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Consulting block')
    expect(wrapper.text()).toContain('Acme Corp')
  })

  it('renders the subtotal + total', async () => {
    const wrapper = await mountPage()
    const subtotal = wrapper.find('[data-testid="quote-subtotal"]')
    const total = wrapper.find('[data-testid="quote-total"]')
    expect(subtotal.exists()).toBe(true)
    expect(subtotal.text()).toMatch(/250/)
    expect(total.text()).toMatch(/250/)
  })

  it('PATCHes the quote when Save is pressed', async () => {
    const wrapper = await mountPage()
    const save = wrapper.find('[data-testid="quote-save"]')
    expect(save.exists()).toBe(true)
    await save.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const arg = updateMutate.mock.calls[0]![0]
    expect(arg.id).toBe(9)
    // Seeded from the loaded quote; `items` is intentionally omitted so the
    // existing line set is left untouched.
    expect(arg.patch).toMatchObject({ status: 'sent', notes: 'Net 30', valid_until: '2026-12-31' })
    expect(arg.patch.items).toBeUndefined()
  })

  it('surfaces a 404 load error via ErrorAlert', async () => {
    quoteData.value = undefined
    quoteError.value = { status: 404, data: { detail: 'Quote not found' } }
    const wrapper = await mountPage()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Quote not found')
  })
})
