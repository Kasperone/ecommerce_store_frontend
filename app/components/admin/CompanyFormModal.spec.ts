// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import CompanyFormModal from './CompanyFormModal.vue'

/**
 * The modal owns the create/update mutations + the success toast and the
 * client-side validation (name required). We stub the auto-imported
 * mutations/toast and assert: create-vs-edit title + prefill, the create/update
 * payloads (name trimmed, blank optionals nulled, status carried), the
 * name-required guard, error rendering, and a11y. URL/verb mapping is pinned in
 * the query spec.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
  },
}

const { createMutate, updateMutate, toastAdd } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useCreateCompany', () => () => ({
  mutateAsync: createMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useUpdateCompany', () => () => ({
  mutateAsync: updateMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

// The primary-contact picker queries the customers list remotely. Stub it with a
// small fixed page so the picker has options without hitting the network.
const customerItems = [
  { id: 11, email: 'buyer@acme.test', company_name: 'Acme Corp' },
  { id: 22, email: 'lead@globex.test', company_name: null },
]
mockNuxtImport('useCustomersQuery', () => () => ({
  data: ref({ items: customerItems, total: customerItems.length }),
}))

beforeEach(() => {
  createMutate.mockReset().mockResolvedValue({})
  updateMutate.mockReset().mockResolvedValue({})
  toastAdd.mockReset()
  document.body.innerHTML = ''
})

function clickSave() {
  const saveBtn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Save',
  ) as HTMLButtonElement | undefined
  saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const tick = () => new Promise(r => setTimeout(r, 0))

const existing = {
  id: 7,
  name: 'Globex',
  tax_id: 'PL1234567890',
  email: 'ap@globex.test',
  phone: '+48123456789',
  status: 'pending' as const,
  account_manager: 'Jan Kowalski',
  notes: 'Key account',
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

describe('CompanyFormModal', () => {
  it('shows the create title when no company is passed', async () => {
    await mountSuspended(CompanyFormModal, { props: { open: true, company: null } })
    expect(document.body.textContent).toContain('New company')
  })

  it('prefills and shows the edit title when a company is passed', async () => {
    await mountSuspended(CompanyFormModal, { props: { open: true, company: existing } })
    expect(document.body.textContent).toContain('Edit company')
    const values = [...document.querySelectorAll('input')].map(i => i.value)
    expect(values).toContain('Globex')
    expect(values).toContain('PL1234567890')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CompanyFormModal, { props: { open: true, company: null } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('creates a company (name trimmed, blank optionals nulled) on save', async () => {
    const wrapper = await mountSuspended(CompanyFormModal, {
      props: { open: true, company: null },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    // [0] = name, [1] = tax_id, [2] = email, [3] = phone, [4] = account_manager.
    inputs[0]!.vm.$emit('update:modelValue', '  Acme Corp  ')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0]![0]
    expect(body).toMatchObject({
      name: 'Acme Corp',
      status: 'pending',
      tax_id: null,
      email: null,
      phone: null,
      account_manager: null,
      notes: null,
      primary_user_id: null,
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('threads the picked primary contact id into the create payload', async () => {
    const wrapper = await mountSuspended(CompanyFormModal, {
      props: { open: true, company: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Acme Corp')
    // The single USelectMenu in the form is the primary-contact picker.
    wrapper.findComponent({ name: 'USelectMenu' }).vm.$emit('update:modelValue', 22)
    await tick()

    clickSave()
    await tick()

    expect(createMutate.mock.calls[0]![0]).toMatchObject({ primary_user_id: 22 })
  })

  it('prefills the current primary contact email on edit and clears it', async () => {
    await mountSuspended(CompanyFormModal, {
      props: {
        open: true,
        company: { ...existing, primary_user_id: 11, primary_user_email: 'buyer@acme.test' },
      },
    })
    expect(document.body.textContent).toContain('buyer@acme.test')

    const clearBtn = document.querySelector(
      '[data-testid="company-primary-contact-clear"]',
    ) as HTMLButtonElement
    expect(clearBtn).toBeTruthy()
    clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    clickSave()
    await tick()

    expect(updateMutate.mock.calls[0]![0].patch).toMatchObject({ primary_user_id: null })
  })

  it('rejects a blank name without calling the mutation', async () => {
    const wrapper = await mountSuspended(CompanyFormModal, {
      props: { open: true, company: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', '   ')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('updates an existing company on save (PATCH payload carries status)', async () => {
    const wrapper = await mountSuspended(CompanyFormModal, {
      props: { open: true, company: existing },
    })
    // First USelect is the status picker.
    wrapper.findAllComponents({ name: 'USelect' })[0]!.vm.$emit('update:modelValue', 'approved')
    await tick()

    clickSave()
    await tick()

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const { id, patch } = updateMutate.mock.calls[0]![0]
    expect(id).toBe(7)
    expect(patch).toMatchObject({ name: 'Globex', status: 'approved', tax_id: 'PL1234567890' })
  })

  it('shows an error alert and no toast when the mutation fails', async () => {
    createMutate.mockRejectedValue({ data: { detail: 'Tax id already exists' } })
    const wrapper = await mountSuspended(CompanyFormModal, {
      props: { open: true, company: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Dup Inc')
    await tick()

    clickSave()
    await tick()

    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Tax id already exists')
    expect(toastAdd).not.toHaveBeenCalled()
  })
})
