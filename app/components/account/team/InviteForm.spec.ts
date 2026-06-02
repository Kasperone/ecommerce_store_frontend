// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import InviteForm from './InviteForm.vue'

/**
 * Invite-a-member form. Validates email + role and emits the typed payload on a
 * valid submit; refuses to emit on an empty/invalid email. Stateless +
 * parent-driven (the page owns the mutation + error surfacing).
 */

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

async function flush(wrapper: { vm: { $nextTick: () => Promise<void> } }) {
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

describe('AccountTeamInviteForm', () => {
  it('emits submit with the email + role when valid', async () => {
    const wrapper = await mountSuspended(InviteForm)
    const input = wrapper.find('input[type="email"]')
    await input.setValue('new@co.com')
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toMatchObject({ email: 'new@co.com', role: 'BUYER' })
  })

  it('trims the email before emitting', async () => {
    const wrapper = await mountSuspended(InviteForm)
    await wrapper.find('input[type="email"]').setValue('  spaced@co.com  ')
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ email: 'spaced@co.com' })
  })

  it('does not emit submit when the email is empty', async () => {
    const wrapper = await mountSuspended(InviteForm)
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('does not emit submit when the email is invalid', async () => {
    const wrapper = await mountSuspended(InviteForm)
    await wrapper.find('input[type="email"]').setValue('not-an-email')
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('clears the email field after a successful submit', async () => {
    const wrapper = await mountSuspended(InviteForm)
    const input = wrapper.find('input[type="email"]')
    await input.setValue('new@co.com')
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('is axe-clean (labelled controls)', async () => {
    const wrapper = await mountSuspended(InviteForm)
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
