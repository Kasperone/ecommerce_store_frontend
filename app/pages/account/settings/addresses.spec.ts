// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { Address } from '~/composables/queries/useAddresses'

/**
 * Address-book settings page. It owns: the list (client-gated Colada query),
 * an add/edit form modal (create/update mutations), a delete confirm modal
 * (UModal → individual `it()` blocks, assert on `document.body.textContent`),
 * and set-default-shipping / set-default-billing (partial PUTs).
 *
 * The Colada composables, the auth store, and `useToast` are mocked at their
 * auto-import boundaries.
 */

const ADDRESSES: Address[] = [
  {
    id: 1,
    created_at: '2026-05-28T10:00:00Z',
    updated_at: '2026-05-28T10:00:00Z',
    label: 'Home',
    recipient_name: 'Jane Doe',
    street: '1 Main St',
    city: 'Warsaw',
    postal_code: '00-001',
    country: 'PL',
    state: null,
    phone: null,
    is_default_shipping: true,
    is_default_billing: true,
    user_id: 7,
  },
  {
    id: 2,
    created_at: '2026-05-27T09:00:00Z',
    updated_at: '2026-05-27T09:00:00Z',
    label: 'Office',
    recipient_name: 'Jane Doe',
    street: '99 Market Rd',
    city: 'Berlin',
    postal_code: '10115',
    country: 'DE',
    state: null,
    phone: null,
    is_default_shipping: false,
    is_default_billing: false,
    user_id: 7,
  },
]

const addressesData = ref<Address[]>(ADDRESSES)
const addressesLoading = ref(false)
const createMutate = vi.fn()
const updateMutate = vi.fn()
const deleteMutate = vi.fn()

vi.mock('~/composables/queries/useAddresses', () => ({
  useAddressesQuery: () => ({ data: addressesData, isLoading: addressesLoading }),
  useCreateAddress: () => ({ mutateAsync: createMutate }),
  useUpdateAddress: () => ({ mutateAsync: updateMutate }),
  useDeleteAddress: () => ({ mutateAsync: deleteMutate }),
}))

mockNuxtImport('useAuthStore', () => () => ({}))

const toastAdd = vi.fn()
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const tick = () => new Promise(r => setTimeout(r, 0))

async function mountPage() {
  const AddressesPage = (await import('./addresses.vue')).default
  return mountSuspended(AddressesPage, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

function allButtons(wrapper: Awaited<ReturnType<typeof mountPage>>): HTMLButtonElement[] {
  const inPage = [...wrapper.element.querySelectorAll('button')] as HTMLButtonElement[]
  const inBody = [...document.body.querySelectorAll('button')] as HTMLButtonElement[]
  return [...new Set([...inPage, ...inBody])]
}

function buttonsByText(
  wrapper: Awaited<ReturnType<typeof mountPage>>,
  text: string,
): HTMLButtonElement[] {
  return allButtons(wrapper).filter(b => b.textContent?.trim() === text)
}

function combinedText(wrapper: Awaited<ReturnType<typeof mountPage>>): string {
  return `${wrapper.element.textContent ?? ''}${document.body.textContent ?? ''}`
}

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

// Walk the Vue component chain from a (teleported) DOM node to the nearest
// ancestor that `defineExpose`d a `state` object — used to seed the AddressForm
// inside the teleported modal, whose USelect can't be driven via DOM events.
function findExposedState(el: Element): Record<string, unknown> {
  let component = (el as any).__vueParentComponent
  while (component) {
    const exposed = component.exposed
    if (exposed && 'state' in exposed) return exposed.state as Record<string, unknown>
    component = component.parent
  }
  throw new Error('No component exposing `state` found from element')
}

beforeEach(() => {
  addressesData.value = ADDRESSES
  addressesLoading.value = false
  createMutate.mockReset().mockResolvedValue(undefined)
  updateMutate.mockReset().mockResolvedValue(undefined)
  deleteMutate.mockReset().mockResolvedValue(undefined)
  toastAdd.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('account/settings/addresses — list', () => {
  it('renders a card per saved address', async () => {
    const wrapper = await mountPage()
    expect(combinedText(wrapper)).toContain('Home')
    expect(combinedText(wrapper)).toContain('1 Main St')
    expect(combinedText(wrapper)).toContain('99 Market Rd')
  })

  it('badges the default shipping and billing address', async () => {
    const wrapper = await mountPage()
    expect(combinedText(wrapper)).toContain('Default shipping')
    expect(combinedText(wrapper)).toContain('Default billing')
  })

  it('shows the empty state when there are no addresses', async () => {
    addressesData.value = []
    const wrapper = await mountPage()
    expect(combinedText(wrapper)).toContain('You have no saved addresses yet.')
  })
})

describe('account/settings/addresses — set default', () => {
  it('calls update with is_default_shipping for a non-default address', async () => {
    const wrapper = await mountPage()
    // Only the non-default address (id 2) shows "Set as default shipping".
    buttonsByText(wrapper, 'Set as default shipping')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(updateMutate).toHaveBeenCalledWith({ id: 2, body: { is_default_shipping: true } })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('calls update with is_default_billing for a non-default address', async () => {
    const wrapper = await mountPage()
    buttonsByText(wrapper, 'Set as default billing')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(updateMutate).toHaveBeenCalledWith({ id: 2, body: { is_default_billing: true } })
  })
})

describe('account/settings/addresses — add', () => {
  it('opens the add form modal when Add address is pressed', async () => {
    const wrapper = await mountPage()
    buttonsByText(wrapper, 'Add address')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(document.body.textContent).toContain('Add an address')
  })

  it('calls create with the normalized payload on submit', async () => {
    const wrapper = await mountPage()
    buttonsByText(wrapper, 'Add address')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()

    // The country field is a non-native USelect that can't be driven from a
    // happy-dom test, so seed the form's reactive state directly (the submit
    // path + payload normalization are what this test asserts; the form's own
    // validation/emit is covered in AddressForm.spec.ts). The modal form is
    // teleported into document.body, so reach the AddressForm's exposed `state`
    // by walking the Vue component chain from the teleported <form> element.
    const formEl = [...document.body.querySelectorAll('form')].pop()!
    const state = findExposedState(formEl)
    Object.assign(state, {
      recipient_name: 'John Smith',
      street: '5 Park Ave',
      city: 'Krakow',
      postal_code: '30-001',
      country: 'PL',
    })
    await tick()

    formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await tick()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const payload = createMutate.mock.calls[0]![0]
    expect(payload).toMatchObject({
      recipient_name: 'John Smith',
      street: '5 Park Ave',
      city: 'Krakow',
      postal_code: '30-001',
      country: 'PL',
    })
  })
})

describe('account/settings/addresses — edit', () => {
  it('opens the edit modal seeded with the address when Edit is pressed', async () => {
    const wrapper = await mountPage()
    const editBtn = allButtons(wrapper).find(
      b => b.getAttribute('aria-label') === 'Edit address',
    )
    click(editBtn!)
    await tick()
    expect(document.body.textContent).toContain('Edit address')
    // Seeded recipient value is present in the form.
    const inputs = [...document.body.querySelectorAll('input')] as HTMLInputElement[]
    expect(inputs.some(i => i.value === 'Jane Doe')).toBe(true)
  })
})

describe('account/settings/addresses — delete', () => {
  it('opens the delete confirm modal when Delete is pressed', async () => {
    const wrapper = await mountPage()
    const delBtn = allButtons(wrapper).find(
      b => b.getAttribute('aria-label') === 'Delete address',
    )
    click(delBtn!)
    await tick()
    expect(document.body.textContent).toContain('Delete this address?')
  })

  it('calls the delete mutation on confirm and toasts success', async () => {
    const wrapper = await mountPage()
    const delBtn = allButtons(wrapper).find(
      b => b.getAttribute('aria-label') === 'Delete address',
    )
    click(delBtn!)
    await tick()
    // The modal confirm "Delete" button (text-only) — the last matching button.
    const deleteButtons = buttonsByText(wrapper, 'Delete')
    click(deleteButtons[deleteButtons.length - 1]!)
    await tick()

    expect(deleteMutate).toHaveBeenCalledWith(1)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })
})
