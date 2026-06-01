// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { CampaignResponse } from '~/composables/queries/useCampaignQueries'
import CampaignSendConfirm from './CampaignSendConfirm.vue'

/**
 * Stateless, parent-driven send-confirm. We assert the copy names the audience
 * and warns that it sends real email, emits `confirm` with the id on Send,
 * disables the button while loading, surfaces a passed-in error (e.g. a 409
 * already-sent), and is axe-clean.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

function makeCampaign(over: Partial<CampaignResponse> = {}): CampaignResponse {
  return {
    id: 7,
    name: 'Winter blast',
    subject: 'Winter is here',
    audience: 'all',
    status: 'draft',
    body: null,
    scheduled_at: null,
    sent_at: null,
    created_at: '2026-05-28T00:00:00Z',
    updated_at: '2026-05-28T00:00:00Z',
    ...over,
  }
}

function sendButton(): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Send now',
  ) as HTMLButtonElement
}

// Each test renders a UModal into document.body — clean up between tests.
afterEach(() => {
  document.body.innerHTML = ''
})

describe('CampaignSendConfirm', () => {
  it('names the campaign and audience in the prompt', async () => {
    await mountSuspended(CampaignSendConfirm, {
      props: { open: true, campaign: makeCampaign({ name: 'Spring sale', audience: 'customers' }) },
    })
    expect(document.body.textContent).toContain('Spring sale')
    // audience label for `customers`
    expect(document.body.textContent).toContain('Customers')
  })

  it('warns that it sends real email (outward-facing)', async () => {
    await mountSuspended(CampaignSendConfirm, {
      props: { open: true, campaign: makeCampaign() },
    })
    expect(document.body.textContent).toContain('This sends real email')
  })

  it('emits confirm with the campaign id on Send', async () => {
    const wrapper = await mountSuspended(CampaignSendConfirm, {
      props: { open: true, campaign: makeCampaign({ id: 42 }) },
    })
    sendButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toBe(42)
  })

  it('does not emit confirm while loading', async () => {
    const wrapper = await mountSuspended(CampaignSendConfirm, {
      props: { open: true, campaign: makeCampaign(), loading: true },
    })
    const btn = sendButton()
    expect(btn.disabled).toBe(true)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('surfaces a passed-in error (e.g. 409 already sent)', async () => {
    await mountSuspended(CampaignSendConfirm, {
      props: {
        open: true,
        campaign: makeCampaign(),
        error: { title: 'Campaign already sent' },
      },
    })
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Campaign already sent')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CampaignSendConfirm, {
      props: { open: true, campaign: makeCampaign() },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
