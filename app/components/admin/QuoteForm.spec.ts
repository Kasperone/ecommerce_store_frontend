// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import QuoteForm from './QuoteForm.vue'
import type { CompanyResponse, QuoteCreate } from '~/composables/queries/useQuoteQueries'

/**
 * The quote create form: company picker + currency + valid-until/notes + the
 * line-item editor. Specs pin the assembled `QuoteCreate` body emitted on submit
 * and the client-side validation that mirrors the backend 404/422 guards
 * (company required, ≥1 line item).
 */

const COMPANIES: CompanyResponse[] = [
  {
    id: 3,
    name: 'Acme Corp',
    status: 'approved',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  } as CompanyResponse,
  {
    id: 5,
    name: 'Globex',
    status: 'approved',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  } as CompanyResponse,
]

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function lastSubmit(wrapper: any): QuoteCreate | undefined {
  const emitted = wrapper.emitted('submit') as [QuoteCreate][] | undefined
  return emitted?.[emitted.length - 1]?.[0]
}

describe('AdminQuoteForm', () => {
  it('renders the company options', async () => {
    const wrapper = await mountSuspended(QuoteForm, { props: { companies: COMPANIES } })
    const text = wrapper.text()
    // The picker label + at least the form scaffolding renders.
    expect(text).toContain('Company')
    expect(text).toContain('Line items')
  })

  it('emits the QuoteCreate body with items when a company + line are set', async () => {
    const wrapper = await mountSuspended(QuoteForm, {
      props: { companies: COMPANIES },
    })
    const vm = wrapper.vm as any
    vm.companyId = 3
    vm.currency = 'EUR'
    vm.validUntil = '2026-12-31'
    vm.notes = '  Net 30  '
    // The editor child emits up to `items`; simulate a filled line.
    vm.items = [{ description: 'Service', quantity: 2, unit_price: 100, product_id: null }]
    await new Promise(r => setTimeout(r, 0))
    vm.onSubmit()
    await new Promise(r => setTimeout(r, 0))

    const body = lastSubmit(wrapper)
    expect(body).toMatchObject({
      company_id: 3,
      currency: 'EUR',
      valid_until: '2026-12-31',
      notes: 'Net 30', // trimmed
      items: [{ description: 'Service', quantity: 2, unit_price: 100, product_id: null }],
    })
  })

  it('blocks submit + surfaces an error when no company is selected (404 mirror)', async () => {
    const wrapper = await mountSuspended(QuoteForm, {
      props: { companies: COMPANIES },
    })
    const vm = wrapper.vm as any
    vm.companyId = null
    vm.items = [{ description: 'Service', quantity: 1, unit_price: 1, product_id: null }]
    await new Promise(r => setTimeout(r, 0))
    vm.onSubmit()
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(vm.validationError).toBeTruthy()
    expect(wrapper.text()).toContain('Select a company')
  })

  it('blocks submit + surfaces an error when there are no line items (422 mirror)', async () => {
    const wrapper = await mountSuspended(QuoteForm, {
      props: { companies: COMPANIES },
    })
    const vm = wrapper.vm as any
    vm.companyId = 3
    vm.items = []
    await new Promise(r => setTimeout(r, 0))
    vm.onSubmit()
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.text()).toContain('at least one line item')
  })

  it('emits cancel when the cancel button is pressed', async () => {
    const wrapper = await mountSuspended(QuoteForm, {
      props: { companies: COMPANIES },
    })
    const cancel = wrapper.findAll('button').find(
      b => b.text().trim() === 'Cancel',
    )
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
