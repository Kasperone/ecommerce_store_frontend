// @vitest-environment nuxt
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
    const [url, opts] = apiFetch.mock.calls[0]
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
