// @vitest-environment nuxt
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * Public contact page. The page owns: client-side validation of the four
 * fields (name/email/subject/message), POSTing to `/api/v1/contact` via the
 * `useApi` wrapper, a success/failure toast, and clearing the form on success.
 *
 * `useApi` is mocked at the auto-import boundary so the submit path is fully
 * deterministic; `useToast` is stubbed to assert on the surfaced colour.
 */

const apiFetch = vi.fn()
const toastAdd = vi.fn()

mockNuxtImport('useApi', () => () => ({ apiFetch }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

// The page reads the public store_config for the contact email/phone. Mock it so
// the only apiFetch call under test is the contact-form POST (the real composable
// would otherwise fire its own GET /api/v1/store-config on mount). Declared
// post-imports; the mock factory closes over it lazily (mockNuxtImport hoists).
const storeConfig = ref<{
  email?: string
  phone?: string
  address_line?: string
  address_line2?: string
  postal_city?: string
  country?: string
} | null>(null)
mockNuxtImport('useStoreConfig', () => () => ({ data: storeConfig }))

const tick = () => new Promise(r => setTimeout(r, 0))

async function mountPage() {
  const ContactPage = (await import('./index.vue')).default
  return mountSuspended(ContactPage)
}

function findInput(wrapper: Awaited<ReturnType<typeof mountPage>>, name: string) {
  return wrapper
    .findAllComponents({ name: 'UFormField' })
    .find(f => f.props('name') === name)!
    .find('input, textarea')
}

async function fillValid(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  await findInput(wrapper, 'name').setValue('Ada Lovelace')
  await findInput(wrapper, 'email').setValue('ada@example.com')
  await findInput(wrapper, 'subject').setValue('A question')
  await findInput(wrapper, 'message').setValue('Hello, I have a question.')
}

async function submit(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  await wrapper.find('form').trigger('submit')
  await tick()
  await wrapper.vm.$nextTick()
}

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({ status: 'sent' })
  toastAdd.mockReset()
})

describe('contact page', () => {
  it('renders the title, draft notice and all four form fields', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Contact Us')
    // counsel-review notice
    expect(wrapper.text()).toContain('Draft')
    for (const name of ['name', 'email', 'subject', 'message']) {
      expect(findInput(wrapper, name).exists()).toBe(true)
    }
  })

  it('does not POST when required fields are empty', async () => {
    const wrapper = await mountPage()
    await submit(wrapper)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('does not POST with an invalid email', async () => {
    const wrapper = await mountPage()
    await fillValid(wrapper)
    await findInput(wrapper, 'email').setValue('not-an-email')
    await submit(wrapper)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('POSTs the trimmed payload to /api/v1/contact on a valid submit', async () => {
    const wrapper = await mountPage()
    await fillValid(wrapper)
    await submit(wrapper)

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/contact')
    expect(opts.method).toBe('POST')
    expect(opts.body).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'A question',
      message: 'Hello, I have a question.',
    })
  })

  it('shows a success toast and clears the form on success', async () => {
    const wrapper = await mountPage()
    await fillValid(wrapper)
    await submit(wrapper)

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' }),
    )
    expect((findInput(wrapper, 'name').element as HTMLInputElement).value).toBe('')
    expect((findInput(wrapper, 'message').element as HTMLTextAreaElement).value).toBe('')
  })

  it('shows an error toast when the request fails', async () => {
    apiFetch.mockRejectedValueOnce(new Error('network'))
    const wrapper = await mountPage()
    await fillValid(wrapper)
    await submit(wrapper)

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' }),
    )
  })
})

describe('contact details block', () => {
  /**
   * These rows used to fall back to i18n placeholders when store_config was
   * blank — `support@example.com` and `+48 000 000 000`. Both look like real
   * contact details, so a customer writes to an address nobody reads and
   * concludes they were ignored. Showing nothing is strictly better, and the
   * form beside it still works.
   */
  it('omits the email and phone rows entirely when store_config is blank', async () => {
    storeConfig.value = null
    const wrapper = await mountPage()
    const text = wrapper.text()

    expect(text).not.toContain('@example.com')
    expect(text).not.toContain('+48 000 000 000')
  })

  it('renders the configured email and phone when set', async () => {
    storeConfig.value = { email: 'hello@realstore.pl', phone: '+48 123 456 789' }
    const wrapper = await mountPage()
    const text = wrapper.text()

    expect(text).toContain('hello@realstore.pl')
    expect(text).toContain('+48 123 456 789')
  })

  it('builds the postal address from the store_config parts', async () => {
    storeConfig.value = {
      address_line: 'ul. Prosta 51',
      postal_city: '00-838 Warszawa',
      country: 'Polska',
    }
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('ul. Prosta 51, 00-838 Warszawa, Polska')
  })

  it('falls back to generic address copy rather than inventing one', async () => {
    /** The address fallback is honest ("see the store footer"), not fabricated,
     * which is why it survives where the email/phone placeholders did not. */
    storeConfig.value = { email: 'hello@realstore.pl' }
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('see the store footer')
  })
})
