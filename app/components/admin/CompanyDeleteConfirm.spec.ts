// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { CompanyResponse } from '~/composables/queries/useCompanyQueries'
import CompanyDeleteConfirm from './CompanyDeleteConfirm.vue'

/**
 * Stateless, parent-driven confirm. We assert it renders the company name in the
 * prompt, emits `confirm` with the id on Delete, disables the button while
 * loading, surfaces a passed-in error, and is axe-clean.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

function makeCompany(over: Partial<CompanyResponse> = {}): CompanyResponse {
  return {
    id: 7,
    name: 'Globex',
    tax_id: null,
    email: null,
    phone: null,
    status: 'pending',
    account_manager: null,
    notes: null,
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

describe('CompanyDeleteConfirm', () => {
  it('renders the company name in the confirmation prompt', async () => {
    await mountSuspended(CompanyDeleteConfirm, {
      props: { open: true, company: makeCompany({ name: 'Acme Corp' }) },
    })
    expect(document.body.textContent).toContain('Acme Corp')
  })

  it('emits confirm with the company id on Delete', async () => {
    const wrapper = await mountSuspended(CompanyDeleteConfirm, {
      props: { open: true, company: makeCompany({ id: 42 }) },
    })
    deleteButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toBe(42)
  })

  it('does not emit confirm while loading', async () => {
    const wrapper = await mountSuspended(CompanyDeleteConfirm, {
      props: { open: true, company: makeCompany(), loading: true },
    })
    const btn = deleteButton()
    expect(btn.disabled).toBe(true)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('surfaces a passed-in error', async () => {
    await mountSuspended(CompanyDeleteConfirm, {
      props: {
        open: true,
        company: makeCompany(),
        error: { title: 'Company has quotes' },
      },
    })
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Company has quotes')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CompanyDeleteConfirm, {
      props: { open: true, company: makeCompany() },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
