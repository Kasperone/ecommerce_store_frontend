// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import Footer from './Footer.vue'

// `apiFetch` is shared by useStoreConfig (GET /store-config) and the newsletter
// POST. Default-resolve to an empty store-config so the company block + socials
// stay hidden unless a test opts in.
const { mockApiFetch, mockToastAdd, mockOpenSettings } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockToastAdd: vi.fn(),
  mockOpenSettings: vi.fn(),
}))

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch: mockApiFetch }),
}))

vi.mock('~/composables/useCookieConsent', () => ({
  useCookieConsent: () => ({ openSettings: mockOpenSettings }),
  COOKIE_POLICY_VERSION: '2026-06-05',
}))

mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

const EMPTY_CONFIG = {
  store_name: '', legal_name: '', address_line: '', address_line2: '',
  postal_city: '', country: '', nip: '', regon: '', krs: '', email: '', phone: '',
  social_instagram: '', social_facebook: '', social_tiktok: '', social_youtube: '',
}

function configResponse(overrides: Record<string, unknown> = {}) {
  return { ...EMPTY_CONFIG, ...overrides }
}

/** Route `apiFetch` by URL: store-config GET vs newsletter POST. */
function wireApi(opts: { config?: Record<string, unknown> | null, newsletterFails?: boolean } = {}) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url === '/api/v1/store-config') {
      return opts.config === null
        ? Promise.reject(new Error('no config'))
        : Promise.resolve(configResponse(opts.config))
    }
    if (url === '/api/v1/newsletter/subscribe') {
      return opts.newsletterFails
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ status: 'ok' })
    }
    return Promise.resolve(undefined)
  })
}

describe('LayoutFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // useStoreConfig caches by a fixed useAsyncData key — clear it so each test
    // re-runs the (re-wired) fetch instead of reusing a prior payload.
    clearNuxtData('store-config-public')
    wireApi()
  })

  it('renders the current year in the copyright line', async () => {
    const wrapper = await mountSuspended(Footer)
    expect(wrapper.text()).toContain(String(new Date().getFullYear()))
  })

  it('links every footer item to a real route — no dead links, no ODR', async () => {
    const wrapper = await mountSuspended(Footer)
    const hrefs = wrapper.findAll('a').map(a => a.attributes('href'))

    // Each labelled destination has its OWN correct link.
    expect(hrefs).toContain('/products')
    expect(hrefs).toContain('/contact')
    expect(hrefs).toContain('/faq')
    expect(hrefs).toContain('/returns')
    expect(hrefs).toContain('/shipping-returns')
    expect(hrefs).toContain('/about')
    expect(hrefs).toContain('/login')
    expect(hrefs).toContain('/sign-up')
    expect(hrefs).toContain('/account')
    expect(hrefs).toContain('/terms-of-service')
    expect(hrefs).toContain('/privacy-policy')
    expect(hrefs).toContain('/cookie-policy')
    expect(hrefs).toContain('/accessibility')

    // No placeholder links and no (now-illegal) EU ODR link anywhere.
    expect(hrefs).not.toContain('#')
    expect(hrefs.some(h => h?.includes('odr'))).toBe(false)
    expect(wrapper.html().toLowerCase()).not.toContain('consumers/odr')
  })

  it('returns and shipping each get a distinct dedicated link', async () => {
    const wrapper = await mountSuspended(Footer)
    const hrefs = wrapper.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toContain('/returns')
    expect(hrefs).toContain('/shipping-returns')
  })

  it('does NOT render the US-only "Do Not Sell" link by default', async () => {
    const wrapper = await mountSuspended(Footer)
    expect(wrapper.text()).not.toContain('Do Not Sell')
  })

  it('"Cookie settings" is a button that calls useCookieConsent().openSettings()', async () => {
    const wrapper = await mountSuspended(Footer)
    const btn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('cookie settings'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(mockOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('shows an inline error for an invalid newsletter email', async () => {
    const wrapper = await mountSuspended(Footer)
    await wrapper.find('input[type="email"]').setValue('not-an-email')
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text().toLowerCase()).toMatch(/valid email/)
    expect(mockApiFetch).not.toHaveBeenCalledWith('/api/v1/newsletter/subscribe', expect.anything())
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('blocks submit until the marketing-consent checkbox is ticked', async () => {
    const wrapper = await mountSuspended(Footer)
    await wrapper.find('input[type="email"]').setValue('user@example.com')
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(mockApiFetch).not.toHaveBeenCalledWith('/api/v1/newsletter/subscribe', expect.anything())
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('POSTs to /newsletter/subscribe and toasts on a consented valid submit', async () => {
    const wrapper = await mountSuspended(Footer)
    const input = wrapper.find('input[type="email"]')
    await input.setValue('user@example.com')
    // Nuxt UI's UCheckbox is a reka-ui button[role="checkbox"], not a native input.
    await wrapper.find('[role="checkbox"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/newsletter/subscribe',
      expect.objectContaining({ method: 'POST', body: { email: 'user@example.com' } }),
    )
    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('renders the company-identification block + socials from store-config', async () => {
    wireApi({
      config: {
        legal_name: 'Acme Sp. z o.o.',
        address_line: 'ul. Testowa 1',
        postal_city: '00-001 Warszawa',
        country: 'Poland',
        nip: '1234567890',
        regon: '987654321',
        krs: '0000111222',
        email: 'hello@acme.test',
        phone: '+48 123 456 789',
        social_instagram: 'https://instagram.com/acme',
      },
    })
    const wrapper = await mountSuspended(Footer)
    const body = wrapper.text()
    expect(body).toContain('Acme Sp. z o.o.')
    expect(body).toContain('1234567890') // NIP
    expect(body).toContain('987654321') // REGON
    expect(body).toContain('0000111222') // KRS
    // Only the populated social (Instagram) renders.
    expect(wrapper.find('[aria-label="Instagram"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Facebook"]').exists()).toBe(false)
  })

  it('hides the company block + socials when store-config is empty/unavailable', async () => {
    wireApi({ config: null })
    const wrapper = await mountSuspended(Footer)
    expect(wrapper.find('address').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Instagram"]').exists()).toBe(false)
  })

  it('renders the trust strip and payment icons', async () => {
    const wrapper = await mountSuspended(Footer)
    expect(wrapper.find('[aria-label="Visa"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Mastercard"]').exists()).toBe(true)
  })

  it('renders a back-to-top control', async () => {
    const wrapper = await mountSuspended(Footer)
    const labels = wrapper.findAll('[aria-label]').map(el => el.attributes('aria-label'))
    expect(labels.some(l => l?.toLowerCase().includes('back to top'))).toBe(true)
  })
})
