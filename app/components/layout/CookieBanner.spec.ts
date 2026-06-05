// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import CookieBanner from './CookieBanner.vue'

/**
 * The banner reads shared state from `useCookieConsent`. We mock that composable
 * with real `ref`s + spy actions so we can drive `hasDecided` / `isOpen` / `gpc`
 * and assert the action wiring. The banner Teleports to `<body>`, so DOM
 * assertions read `document.body` (per the UModal/teleport testing rule).
 */

// Declared at module scope (post-imports) so the `ref()` calls run after Vue is
// imported — `vi.hoisted` would lift them above the import and crash with
// "Cannot access ... before initialization". The `mockNuxtImport` factory closes
// over them and runs lazily, so this is safe (see the hoisted-ref testing rule).
const consent = {
  categories: ref({ necessary: true, analytics: false, marketing: false }),
  hasDecided: ref(false),
  isOpen: ref(false),
  gpc: ref(false),
  acceptAll: vi.fn(),
  rejectAll: vi.fn(),
  save: vi.fn(),
  openSettings: vi.fn(),
  close: vi.fn(),
}

mockNuxtImport('useCookieConsent', () => () => consent)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

// Track mounted wrappers so we can `unmount()` them (which tears down the
// Teleport cleanly) instead of nuking `document.body` out from under a live
// component — the latter races Vue's patch/insert and throws on teardown.
const wrappers: { unmount: () => void }[] = []
async function mount() {
  const w = await mountSuspended(CookieBanner)
  wrappers.push(w)
  return w
}

beforeEach(() => {
  consent.categories.value = { necessary: true, analytics: false, marketing: false }
  consent.hasDecided.value = false
  consent.isOpen.value = false
  consent.gpc.value = false
  consent.acceptAll.mockReset()
  consent.rejectAll.mockReset()
  consent.save.mockReset()
  consent.openSettings.mockReset()
  consent.close.mockReset()
})

afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount()
})

function dialog() {
  return document.body.querySelector('[role="dialog"]')
}

describe('LayoutCookieBanner', () => {
  it('shows on first visit (no decision) with the three primary actions', async () => {
    await mount()
    const el = dialog()
    expect(el).not.toBeNull()
    const text = document.body.textContent ?? ''
    expect(text).toContain('We value your privacy')
    expect(text).toContain('Accept all')
    expect(text).toContain('Reject non-essential')
    expect(text).toContain('Manage preferences')
  })

  it('is hidden once a decision is made and not re-opened', async () => {
    consent.hasDecided.value = true
    consent.isOpen.value = false
    await mount()
    expect(dialog()).toBeNull()
  })

  it('shows when re-opened via isOpen even after a decision', async () => {
    consent.hasDecided.value = true
    consent.isOpen.value = true
    await mount()
    expect(dialog()).not.toBeNull()
  })

  it('Accept all triggers acceptAll', async () => {
    await mount()
    const btn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Accept all'))
    btn?.click()
    expect(consent.acceptAll).toHaveBeenCalledTimes(1)
  })

  it('Reject non-essential triggers rejectAll', async () => {
    await mount()
    const btn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Reject non-essential'))
    btn?.click()
    expect(consent.rejectAll).toHaveBeenCalledTimes(1)
  })

  it('Manage preferences reveals category toggles + a Save action', async () => {
    await mount()
    const manage = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent?.trim() === 'Manage preferences')
    manage?.click()
    await new Promise(r => setTimeout(r, 0))
    const text = document.body.textContent ?? ''
    expect(text).toContain('Strictly necessary')
    expect(text).toContain('Analytics')
    expect(text).toContain('Marketing')
    expect(text).toContain('Save preferences')
  })

  it('renders the GPC notice when gpc is true', async () => {
    consent.gpc.value = true
    await mount()
    expect(document.body.textContent).toContain('Global Privacy Control')
  })

  it('links to the cookie + privacy policy pages', async () => {
    await mount()
    const hrefs = [...document.body.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/cookie-policy')
    expect(hrefs).toContain('/privacy-policy')
  })

  it('is axe-clean on first visit', async () => {
    await mount()
    const el = dialog() as HTMLElement
    expect(await axe(el, AXE_OPTIONS)).toHaveNoViolations()
  })
})
