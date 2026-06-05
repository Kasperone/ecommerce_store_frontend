// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * Smoke test: every static legal / info page mounts, renders its localized
 * H1 (not a "Coming soon" stub), and shows the mandatory counsel-review
 * draft notice. The contact page is covered separately (it has a form) in
 * `contact/index.spec.ts`.
 */

const PAGES: Array<{ name: string, importer: () => Promise<unknown>, heading: string }> = [
  { name: 'terms-of-service', importer: () => import('./terms-of-service/index.vue'), heading: 'Terms of Service' },
  { name: 'privacy-policy', importer: () => import('./privacy-policy/index.vue'), heading: 'Privacy Policy' },
  { name: 'cookie-policy', importer: () => import('./cookie-policy/index.vue'), heading: 'Cookie Policy' },
  { name: 'accessibility', importer: () => import('./accessibility/index.vue'), heading: 'Accessibility Statement' },
  { name: 'shipping-returns', importer: () => import('./shipping-returns/index.vue'), heading: 'Shipping & Delivery' },
  { name: 'returns', importer: () => import('./returns/index.vue'), heading: 'Returns & Right of Withdrawal' },
  { name: 'faq', importer: () => import('./faq/index.vue'), heading: 'Frequently Asked Questions' },
  { name: 'about', importer: () => import('./about/index.vue'), heading: 'About Us' },
]

describe('static legal / info pages', () => {
  it.each(PAGES)('$name mounts with its heading and draft notice', async ({ importer, heading }) => {
    const page = (await importer() as { default: unknown }).default
    const wrapper = await mountSuspended(page as never)
    const text = wrapper.text()
    expect(text).toContain(heading)
    expect(text).not.toContain('Coming soon')
    // Counsel-review notice present on every legal page.
    expect(text).toContain('Draft')
  })

  it('faq renders all question items', async () => {
    const page = (await import('./faq/index.vue')).default
    const wrapper = await mountSuspended(page)
    expect(wrapper.text()).toContain('How can I track my order?')
    expect(wrapper.text()).toContain('Do you sell to businesses (B2B)?')
  })

  it('contains no EU ODR platform link anywhere', async () => {
    for (const { importer } of PAGES) {
      const page = (await importer() as { default: unknown }).default
      const wrapper = await mountSuspended(page as never)
      expect(wrapper.html().toLowerCase()).not.toContain('ec.europa.eu/consumers/odr')
    }
  })
})
