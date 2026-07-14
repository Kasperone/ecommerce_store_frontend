// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import GiftCardIssueModal from './GiftCardIssueModal.vue'

/**
 * The issue modal owns the issue mutation, the success toast, and — the D4
 * contract — the one-time plaintext-code reveal: the 201 body's `code` is
 * shown in a non-dismissible panel with a "never shown again" warning and is
 * dropped from memory on Done. We stub the mutation/toast auto-imports and
 * assert the payload normalization (empty strings → null), the validation
 * guards, and the reveal lifecycle. URL/verb mapping is pinned in the query
 * spec.
 */

const { issueMutate, toastAdd } = vi.hoisted(() => ({
  issueMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useIssueGiftCard', () => () => ({
  mutateAsync: issueMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const ISSUED = {
  id: 9,
  created_at: '2026-07-14T00:00:00Z',
  updated_at: '2026-07-14T00:00:00Z',
  last4: 'DDDD',
  initial_value: 100,
  balance: 100,
  currency: 'PLN',
  status: 'active',
  expires_at: null,
  recipient_email: null,
  user_id: null,
  note: null,
  code: 'AAAA-BBBB-CCCC-DDDD',
}

beforeEach(() => {
  issueMutate.mockReset().mockResolvedValue(ISSUED)
  toastAdd.mockReset()
  document.body.innerHTML = ''
})

function clickIssue() {
  const btn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Issue',
  ) as HTMLButtonElement | undefined
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const tick = () => new Promise(r => setTimeout(r, 0))

describe('GiftCardIssueModal', () => {
  it('shows the issue form when open', async () => {
    await mountSuspended(GiftCardIssueModal, { props: { open: true } })
    expect(document.body.textContent).toContain('Issue gift card')
  })

  it('issues with empty optionals normalized to null', async () => {
    const wrapper = await mountSuspended(GiftCardIssueModal, { props: { open: true } })
    const numbers = wrapper.findAllComponents({ name: 'UInputNumber' })
    numbers[0]!.vm.$emit('update:modelValue', 100) // initial_value
    await tick()

    clickIssue()
    await tick()

    expect(issueMutate).toHaveBeenCalledTimes(1)
    expect(issueMutate.mock.calls[0]![0]).toMatchObject({
      initial_value: 100,
      currency: 'USD',
      expires_at: null,
      recipient_email: null,
      user_id: null,
      note: null,
      locale: 'en',
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('blocks submit without a positive initial value', async () => {
    await mountSuspended(GiftCardIssueModal, { props: { open: true } })
    clickIssue()
    await tick()

    expect(issueMutate).not.toHaveBeenCalled()
  })

  it('blocks submit on an invalid recipient email', async () => {
    const wrapper = await mountSuspended(GiftCardIssueModal, { props: { open: true } })
    const numbers = wrapper.findAllComponents({ name: 'UInputNumber' })
    numbers[0]!.vm.$emit('update:modelValue', 100)
    const emailInput = wrapper.findAllComponents({ name: 'UInput' })
      .find(c => c.props('type') === 'email')
    emailInput!.vm.$emit('update:modelValue', 'not-an-email')
    await tick()

    clickIssue()
    await tick()

    expect(issueMutate).not.toHaveBeenCalled()
  })

  it('reveals the plaintext code once with the warning, then drops it on Done', async () => {
    const wrapper = await mountSuspended(GiftCardIssueModal, { props: { open: true } })
    const numbers = wrapper.findAllComponents({ name: 'UInputNumber' })
    numbers[0]!.vm.$emit('update:modelValue', 100)
    await tick()

    clickIssue()
    await tick()

    // 201 → form closes, code panel opens with the code + shown-once warning.
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('issued')?.[0]?.[0]).toMatchObject({ code: ISSUED.code })
    expect(document.body.textContent).toContain('AAAA-BBBB-CCCC-DDDD')
    expect(document.body.textContent).toContain('will never be shown again')

    // Done is the only way out — and it wipes the plaintext from memory.
    const done = document.querySelector('[data-testid="gift-card-code-done"]') as HTMLButtonElement
    expect(done).toBeTruthy()
    done.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect((wrapper.vm as any).issuedCard).toBeNull()
    expect(document.body.textContent).not.toContain('AAAA-BBBB-CCCC-DDDD')
  })

  it('mentions the emailed recipient in the code panel when one was set', async () => {
    issueMutate.mockResolvedValue({ ...ISSUED, recipient_email: 'gift@example.com' })
    const wrapper = await mountSuspended(GiftCardIssueModal, { props: { open: true } })
    const numbers = wrapper.findAllComponents({ name: 'UInputNumber' })
    numbers[0]!.vm.$emit('update:modelValue', 100)
    const emailInput = wrapper.findAllComponents({ name: 'UInput' })
      .find(c => c.props('type') === 'email')
    emailInput!.vm.$emit('update:modelValue', 'gift@example.com')
    await tick()

    clickIssue()
    await tick()

    expect(issueMutate.mock.calls[0]![0]).toMatchObject({ recipient_email: 'gift@example.com' })
    expect(document.body.textContent).toContain('gift@example.com')
  })
})
