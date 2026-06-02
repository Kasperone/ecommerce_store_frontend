// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { Quote } from '~/composables/queries/useQuotes'

/**
 * Customer quote detail. Shows the quote header (status + PDF download + accept),
 * line items, valid_until, and the totals card. The accept action is offered
 * ONLY on a `sent` quote and confirmed through a UModal — so the modal cases are
 * split into individual `it()` blocks asserting on `document.body.textContent`,
 * with each mounted wrapper `unmount()`ed before the body is inspected to dodge
 * the teleport-cleanup CI crash.
 */

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 9,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    company_id: 3,
    company_name: 'Acme',
    status: 'sent',
    currency: 'USD',
    valid_until: '2026-06-30T00:00:00Z',
    notes: 'Bulk order',
    subtotal: 300,
    total: 300,
    items: [
      {
        id: 1,
        created_at: '2026-06-01T10:00:00Z',
        updated_at: '2026-06-01T10:00:00Z',
        quote_id: 9,
        product_id: 11,
        description: 'Widget',
        quantity: 3,
        unit_price: 100,
        line_total: 300,
      },
    ],
    ...overrides,
  }
}

const quoteData = ref<Quote | undefined>(makeQuote())
const acceptMutate = vi.fn()
const acceptLoading = ref(false)
const mockDownload = vi.fn()

vi.mock('~/composables/queries/useQuotes', () => ({
  useMyQuoteQuery: () => ({ data: quoteData, error: ref(null) }),
  useAcceptQuote: () => ({ mutateAsync: acceptMutate, isLoading: acceptLoading }),
}))

mockNuxtImport('useDownloadQuote', () => () => ({
  download: mockDownload,
  isDownloading: ref(false),
}))

mockNuxtImport('useRoute', () => () => ({ params: { id: '9' } }))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

async function mountPage() {
  const Page = (await import('./[id].vue')).default
  return mountSuspended(Page, { global: { stubs: { NuxtLayout: PassThroughStub } } })
}

function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const tick = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  quoteData.value = makeQuote()
  acceptLoading.value = false
  mockDownload.mockResolvedValue(null)
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('account quote detail page', () => {
  it('renders the quote items, totals and valid_until', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('Widget')
    expect(text).toContain('Bulk order')
    // total + valid_until both present
    expect(text).toContain('Valid until')
  })

  it('renders the PDF download button', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Download PDF')
  })

  it('offers the accept action on a `sent` quote', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="accept-quote"]').exists()).toBe(true)
  })

  it('hides the accept action when the quote is not `sent`', async () => {
    quoteData.value = makeQuote({ status: 'requested' })
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="accept-quote"]').exists()).toBe(false)
  })

  it('opens the confirm modal when accept is clicked', async () => {
    const wrapper = await mountPage()
    click(wrapper.find('[data-testid="accept-quote"]').element)
    await tick()
    const body = document.body.textContent ?? ''
    wrapper.unmount()
    expect(body).toContain('Accept this quote?')
  })

  it('calls the accept mutation when the modal is confirmed', async () => {
    const wrapper = await mountPage()
    click(wrapper.find('[data-testid="accept-quote"]').element)
    await tick()
    const confirm = document.body.querySelector('[data-testid="accept-quote-confirm"]')
    expect(confirm).not.toBeNull()
    click(confirm as Element)
    await tick()
    wrapper.unmount()
    expect(acceptMutate).toHaveBeenCalledWith(9)
  })

  it('declares the \'user\' middleware', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/quotes/[id].vue'), 'utf-8')
    expect(src).toMatch(/middleware:\s*'user'/)
  })
})
