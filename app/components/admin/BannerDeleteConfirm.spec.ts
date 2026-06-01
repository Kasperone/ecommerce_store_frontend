// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { BannerResponse } from '~/composables/queries/useBannerQueries'
import BannerDeleteConfirm from './BannerDeleteConfirm.vue'

/**
 * Stateless, parent-driven confirm. We assert it renders the banner title in the
 * prompt, emits `confirm` with the id on Delete, disables the button while
 * loading, surfaces a passed-in error, and is axe-clean.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

function makeBanner(over: Partial<BannerResponse> = {}): BannerResponse {
  return {
    id: 7,
    title: 'Winter sale',
    subtitle: null,
    image_url: 'https://cdn/winter.jpg',
    link_url: null,
    placement: 'home_hero',
    sort_order: 0,
    starts_at: null,
    ends_at: null,
    is_active: true,
    created_at: '2026-05-28T00:00:00Z',
    updated_at: '2026-05-28T00:00:00Z',
    ...over,
  }
}

function deleteButton(): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Delete',
  ) as HTMLButtonElement
}

// Each test renders a UModal into document.body — clean up between tests.
afterEach(() => {
  document.body.innerHTML = ''
})

describe('BannerDeleteConfirm', () => {
  it('renders the banner title in the confirmation prompt', async () => {
    await mountSuspended(BannerDeleteConfirm, {
      props: { open: true, banner: makeBanner({ title: 'Spring promo' }) },
    })
    expect(document.body.textContent).toContain('Spring promo')
  })

  it('emits confirm with the banner id on Delete', async () => {
    const wrapper = await mountSuspended(BannerDeleteConfirm, {
      props: { open: true, banner: makeBanner({ id: 42 }) },
    })
    deleteButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toBe(42)
  })

  it('does not emit confirm while loading', async () => {
    const wrapper = await mountSuspended(BannerDeleteConfirm, {
      props: { open: true, banner: makeBanner(), loading: true },
    })
    const btn = deleteButton()
    expect(btn.disabled).toBe(true)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('surfaces a passed-in error', async () => {
    await mountSuspended(BannerDeleteConfirm, {
      props: {
        open: true,
        banner: makeBanner(),
        error: { title: 'Banner is locked' },
      },
    })
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Banner is locked')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(BannerDeleteConfirm, {
      props: { open: true, banner: makeBanner() },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
