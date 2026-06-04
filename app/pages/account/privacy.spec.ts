// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * Privacy settings page. Since Phase 4 the marketing/communications consents
 * moved to the Preferences page; Privacy now owns only GDPR data-rights:
 *
 * - **Data export** — `POST /me/data-export` then a client-side JSON file
 *   download (Blob + anchor), both stubbed below.
 * - **Delete account** — behind a UModal confirm; on confirm it calls
 *   `POST /me/account-deletion-request`, clears the session, redirects home.
 *
 * The Colada modules are stubbed at the import boundary; `useAuthStore`,
 * `useToast`, `useRouter`, `useLocalePath` at the auto-import boundary.
 */

const exportMutate = vi.fn()
const deleteMutate = vi.fn()

vi.mock('~/composables/queries/useDataExport', () => ({
  useDataExport: () => ({ mutateAsync: exportMutate }),
}))
vi.mock('~/composables/queries/useAccountDeletion', () => ({
  useAccountDeletion: () => ({ mutateAsync: deleteMutate }),
}))

const clearSession = vi.fn()
mockNuxtImport('useAuthStore', () => () => ({
  clearSession,
  get isAuthenticated() {
    return true
  },
}))

const toastAdd = vi.fn()
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const routerPush = vi.fn()
mockNuxtImport('useRouter', (original: any) => () => {
  const real = original()
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'push') return routerPush
      return Reflect.get(target, prop, receiver)
    },
  })
})

mockNuxtImport('useLocalePath', () => () => (p: string) => p)

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const tick = () => new Promise(r => setTimeout(r, 0))

async function mountPage() {
  const Page = (await import('./privacy.vue')).default
  return mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

// Search both the (detached) page wrapper and document.body (modal teleport).
function buttonByText(
  wrapper: Awaited<ReturnType<typeof mountPage>>,
  text: string,
): HTMLButtonElement | undefined {
  const all = [
    ...(wrapper.element.querySelectorAll('button') as NodeListOf<HTMLButtonElement>),
    ...(document.body.querySelectorAll('button') as NodeListOf<HTMLButtonElement>),
  ]
  return all.find(b => b.textContent?.trim() === text)
}

// --- Blob / anchor download stubs --------------------------------------------
let createdAnchors: HTMLAnchorElement[] = []
const originalCreateElement = document.createElement.bind(document)

beforeEach(() => {
  exportMutate.mockReset().mockResolvedValue({ user: {}, addresses: [], orders: [], consents: [] })
  deleteMutate.mockReset().mockResolvedValue({
    deletion_requested_at: '2026-06-02T00:00:00Z',
    anonymized_at: '2026-06-02T00:00:00Z',
    detail: 'done',
  })
  clearSession.mockReset()
  routerPush.mockReset()
  toastAdd.mockReset()

  createdAnchors = []
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: any) => {
    const el = originalCreateElement(tag, opts)
    if (tag === 'a') {
      vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {})
      createdAnchors.push(el as HTMLAnchorElement)
    }
    return el
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('account/settings/privacy', () => {
  it('export button calls the endpoint and triggers a JSON file download', async () => {
    const wrapper = await mountPage()
    buttonByText(wrapper, 'Download my data')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(exportMutate).toHaveBeenCalledTimes(1)
    expect(createdAnchors).toHaveLength(1)
    const anchor = createdAnchors[0]!
    expect(anchor.download).toMatch(/^account-data-\d{4}-\d{2}-\d{2}\.json$/)
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('toasts an error and triggers no download when the export fails', async () => {
    exportMutate.mockRejectedValue(new Error('boom'))
    const wrapper = await mountPage()
    buttonByText(wrapper, 'Download my data')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(createdAnchors).toHaveLength(0)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })

  it('does not open the delete modal until the trigger is clicked', async () => {
    await mountPage()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens a confirm modal whose copy warns it is irreversible', async () => {
    const wrapper = await mountPage()
    buttonByText(wrapper, 'Delete my account')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(document.querySelector('[role="dialog"]')).toBeTruthy()
    expect(document.body.textContent).toContain('This cannot be undone')
  })

  it('the confirm modal copy states personal data is anonymized', async () => {
    const wrapper = await mountPage()
    buttonByText(wrapper, 'Delete my account')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(document.body.textContent?.toLowerCase()).toContain('anonymizes')
  })

  it('confirming deletion calls the endpoint, clears the session, and redirects home', async () => {
    const wrapper = await mountPage()
    buttonByText(wrapper, 'Delete my account')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    buttonByText(wrapper, 'Delete account')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(deleteMutate).toHaveBeenCalledTimes(1)
    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith('/')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('on deletion failure it keeps the session and toasts an error', async () => {
    deleteMutate.mockRejectedValue(new Error('boom'))
    const wrapper = await mountPage()
    buttonByText(wrapper, 'Delete my account')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    buttonByText(wrapper, 'Delete account')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(clearSession).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})
