// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { OrderListResponse } from '#shared/types/api'
import type { Address } from '~/composables/queries/useAddresses'
import type { Quote } from '~/composables/queries/useQuotes'

/**
 * Account Overview dashboard (redesign Phase 3, §3.5). Replaces the old
 * link-cards with a recent-orders snapshot, a default-address card, a
 * quick-actions grid, and a B2B-gated quotes summary. The three authed Colada
 * queries (orders / addresses / quotes) + the company context are mocked at
 * their auto-import boundaries; the data sections render under <ClientOnly>
 * (resolved in the Nuxt test env).
 */

const ORDERS: OrderListResponse = {
  items: [
    {
      id: 11,
      created_at: '2026-06-01T10:00:00Z',
      updated_at: '2026-06-01T10:00:00Z',
      order_number: 'ORD-20260601-AAA111',
      status: 'paid',
      subtotal: 20,
      discount: 0,
      total: 20,
      currency: 'PLN',
      item_count: 2,
    },
    {
      id: 12,
      created_at: '2026-06-02T10:00:00Z',
      updated_at: '2026-06-02T10:00:00Z',
      order_number: 'ORD-20260602-BBB222',
      status: 'cancelled',
      subtotal: 5,
      discount: 0,
      total: 5,
      currency: 'PLN',
      item_count: 1,
    },
  ],
  total: 2,
  page: 1,
  page_size: 3,
} as unknown as OrderListResponse

const ADDRESSES: Address[] = [
  {
    id: 1,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    label: 'Home',
    recipient_name: 'Claude Shopper',
    street: 'ul. Przykładowa 1',
    city: 'Warszawa',
    postal_code: '00-001',
    country: 'PL',
    state: null,
    phone: null,
    is_default_shipping: true,
    is_default_billing: false,
  } as unknown as Address,
]

const QUOTES: Quote[] = [
  { id: 7, status: 'requested', currency: 'USD', total: 100 } as unknown as Quote,
  { id: 8, status: 'sent', currency: 'USD', total: 250 } as unknown as Quote,
]

const ordersData = ref<OrderListResponse | undefined>(ORDERS)
const addressesData = ref<Address[] | undefined>(ADDRESSES)
const quotesData = ref<Quote[] | undefined>(QUOTES)
const isB2B = ref(false)

vi.mock('~/composables/queries/useOrderQueries', () => ({
  useOrdersQuery: () => ({ data: ordersData }),
}))
vi.mock('~/composables/queries/useAddresses', () => ({
  useAddressesQuery: () => ({ data: addressesData }),
}))
vi.mock('~/composables/queries/useQuotes', () => ({
  useMyQuotesQuery: () => ({ data: quotesData }),
}))

const userRef = ref<Record<string, unknown>>({
  first_name: 'Claude',
  email: 'shopper@example.com',
  locale: 'en',
})
mockNuxtImport('useAuthStore', () => () => ({
  get user() {
    return userRef.value
  },
}))

mockNuxtImport('useCompanyContext', () => () => ({
  company: ref(null),
  isB2B,
  isResolving: ref(false),
  error: ref(null),
}))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

beforeEach(() => {
  ordersData.value = ORDERS
  addressesData.value = ADDRESSES
  quotesData.value = QUOTES
  isB2B.value = false
  userRef.value = { first_name: 'Claude', email: 'shopper@example.com', locale: 'en' }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('account overview dashboard', () => {
  it('greets the signed-in user by name and email', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Claude')
    expect(wrapper.text()).toContain('shopper@example.com')
  })

  it('renders recent orders linking to their detail pages', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('ORD-20260601-AAA111')
    expect(text).toContain('ORD-20260602-BBB222')
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/orders/11')
    expect(hrefs).toContain('/account/orders')
  })

  it('shows an empty-orders message when there are none', async () => {
    ordersData.value = { ...ORDERS, items: [] }
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('haven\'t placed any orders')
  })

  it('renders the default address with a manage link', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('Claude Shopper')
    expect(text).toContain('Warszawa')
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/addresses')
  })

  it('prompts to add an address when none is saved', async () => {
    addressesData.value = []
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No default address')
  })

  it('renders the quick-action links', async () => {
    const wrapper = await mountPage()
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/orders')
    expect(hrefs).toContain('/account/addresses')
    expect(hrefs).toContain('/account/preferences')
  })

  it('hides the quotes summary for non-B2B accounts', async () => {
    isB2B.value = false
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="quotes-summary-card"]').exists()).toBe(false)
  })

  it('shows the quotes summary for B2B accounts with the open count', async () => {
    isB2B.value = true
    const wrapper = await mountPage()
    const card = wrapper.find('[data-testid="quotes-summary-card"]')
    expect(card.exists()).toBe(true)
    expect(card.attributes('href')).toBe('/account/quotes')
    // 2 open (requested + sent), 1 awaiting acceptance (sent).
    expect(card.text()).toContain('2 open quotes')
    expect(card.text()).toContain('1 awaiting')
  })

  it('nudges to add a phone number when it is missing', async () => {
    // Default fixture user has no phone.
    const wrapper = await mountPage()
    const nudge = wrapper.find('[data-testid="completeness-nudge"]')
    expect(nudge.exists()).toBe(true)
    expect(nudge.text()).toContain('Add a phone number')
    const hrefs = nudge.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/profile')
  })

  it('nudges to add a default shipping address when none is set', async () => {
    addressesData.value = []
    const wrapper = await mountPage()
    const nudge = wrapper.find('[data-testid="completeness-nudge"]')
    expect(nudge.exists()).toBe(true)
    expect(nudge.text()).toContain('Add a default shipping address')
  })

  it('hides the nudge once phone and default address are both present', async () => {
    userRef.value = { first_name: 'Claude', email: 'shopper@example.com', locale: 'en', phone: '+48123456789' }
    addressesData.value = ADDRESSES // has a default-shipping address
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="completeness-nudge"]').exists()).toBe(false)
  })

  it('dismisses the nudge when its close control fires', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="completeness-nudge"]').exists()).toBe(true)
    wrapper.findComponent({ name: 'UAlert' }).vm.$emit('update:open', false)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="completeness-nudge"]').exists()).toBe(false)
  })

  it('declares the \'user\' middleware', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/index.vue'), 'utf-8')
    expect(src).toMatch(/middleware:\s*'user'/)
  })
})
