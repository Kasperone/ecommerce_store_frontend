// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { CampaignResponse } from '~/composables/queries/useCampaignQueries'
import CampaignDeleteConfirm from './CampaignDeleteConfirm.vue'

/**
 * Stateless, parent-driven confirm. We assert it renders the campaign name in
 * the prompt, emits `confirm` with the id on Delete, disables the button while
 * loading, surfaces a passed-in error, and is axe-clean.
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

function deleteButton(): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Delete',
  ) as HTMLButtonElement
}

// Each test renders a UModal into document.body — clean up between tests.
afterEach(() => {
  document.body.innerHTML = ''
})

describe('CampaignDeleteConfirm', () => {
  it('renders the campaign name in the confirmation prompt', async () => {
    await mountSuspended(CampaignDeleteConfirm, {
      props: { open: true, campaign: makeCampaign({ name: 'Spring sale' }) },
    })
    expect(document.body.textContent).toContain('Spring sale')
  })

  it('emits confirm with the campaign id on Delete', async () => {
    const wrapper = await mountSuspended(CampaignDeleteConfirm, {
      props: { open: true, campaign: makeCampaign({ id: 42 }) },
    })
    deleteButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toBe(42)
  })

  it('does not emit confirm while loading', async () => {
    const wrapper = await mountSuspended(CampaignDeleteConfirm, {
      props: { open: true, campaign: makeCampaign(), loading: true },
    })
    const btn = deleteButton()
    expect(btn.disabled).toBe(true)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('surfaces a passed-in error', async () => {
    await mountSuspended(CampaignDeleteConfirm, {
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
    await mountSuspended(CampaignDeleteConfirm, {
      props: { open: true, campaign: makeCampaign() },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
