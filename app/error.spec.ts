// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ErrorPage from './error.vue'

/**
 * Branded error page (SEO-0.5): the three copy branches (404 / 410 / 5xx)
 * pick the right localized title + description from `errorPage.*`, and both
 * recovery buttons clear the error with a redirect.
 */

const { mockClearError } = vi.hoisted(() => ({ mockClearError: vi.fn() }))
mockNuxtImport('clearError', () => mockClearError)

function makeError(statusCode: number) {
  return { statusCode, statusMessage: 'boom', message: 'boom', fatal: true, unhandled: false } as never
}

describe('app/error.vue', () => {
  it('renders the 404 branch for a not-found error', async () => {
    const wrapper = await mountSuspended(ErrorPage, { props: { error: makeError(404) } })
    expect(wrapper.text()).toContain('404')
    expect(wrapper.text()).toContain('Page not found')
  })

  it('renders the dedicated 410 branch for discontinued products', async () => {
    const wrapper = await mountSuspended(ErrorPage, { props: { error: makeError(410) } })
    expect(wrapper.text()).toContain('410')
    expect(wrapper.text()).toContain('No longer available')
    expect(wrapper.text()).toContain('discontinued')
  })

  it('renders the generic branch for server errors', async () => {
    const wrapper = await mountSuspended(ErrorPage, { props: { error: makeError(500) } })
    expect(wrapper.text()).toContain('Something went wrong')
  })

  it('treats unknown 4xx as 404 copy', async () => {
    const wrapper = await mountSuspended(ErrorPage, { props: { error: makeError(403) } })
    expect(wrapper.text()).toContain('Page not found')
  })

  it('clears the error with a redirect from both recovery buttons', async () => {
    const wrapper = await mountSuspended(ErrorPage, { props: { error: makeError(404) } })

    await wrapper.find('[data-testid="error-go-home"]').trigger('click')
    expect(mockClearError).toHaveBeenCalledWith({ redirect: '/' })

    await wrapper.find('[data-testid="error-browse-products"]').trigger('click')
    expect(mockClearError).toHaveBeenCalledWith({ redirect: '/products' })
  })
})
