// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { Quote } from '~/composables/queries/useQuotes'

/**
 * Customer quotes list. Renders the caller's company's quotes with a status
 * badge + total, gated behind `useCompanyContext().isB2B` (a direct hit by a
 * non-B2B user shows the "business accounts only" notice). Both the company
 * context and the Colada list query are mocked at their auto-import boundaries.
 */

const QUOTES: Quote[] = [
  {
    id: 7,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    company_id: 3,
    company_name: 'Acme',
    status: 'requested',
    currency: 'USD',
    valid_until: null,
    notes: null,
    subtotal: 100,
    total: 100,
    items: [],
  },
  {
    id: 8,
    created_at: '2026-06-02T10:00:00Z',
    updated_at: '2026-06-02T10:00:00Z',
    company_id: 3,
    company_name: 'Acme',
    status: 'sent',
    currency: 'USD',
    valid_until: null,
    notes: null,
    subtotal: 250,
    total: 250,
    items: [],
  },
]

const quotesData = ref<Quote[] | undefined>(QUOTES)
const isB2B = ref(true)
const isResolving = ref(false)

vi.mock('~/composables/queries/useQuotes', () => ({
  useMyQuotesQuery: () => ({ data: quotesData, error: ref(null) }),
}))

mockNuxtImport('useCompanyContext', () => () => ({
  company: ref(null),
  isB2B,
  isResolving,
  error: ref(null),
}))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return mountSuspended(Page, { global: { stubs: { NuxtLayout: PassThroughStub } } })
}

beforeEach(() => {
  quotesData.value = QUOTES
  isB2B.value = true
  isResolving.value = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('account quotes list page', () => {
  it('renders each quote with its status and total', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('QT-7')
    expect(text).toContain('QT-8')
    expect(text).toContain('Requested')
    expect(text).toContain('Sent')
  })

  it('links each row to its detail page', async () => {
    const wrapper = await mountPage()
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/quotes/7')
    expect(hrefs).toContain('/account/quotes/8')
  })

  it('shows an empty state when there are no quotes', async () => {
    quotesData.value = []
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="quotes-empty"]').exists()).toBe(true)
  })

  it('shows the not-B2B notice for a non-business account', async () => {
    isB2B.value = false
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="not-b2b"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('business accounts only')
  })

  it('declares the \'user\' middleware', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/quotes/index.vue'), 'utf-8')
    expect(src).toMatch(/middleware:\s*'user'/)
  })
})
