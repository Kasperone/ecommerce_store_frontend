// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import BannerFormModal from './BannerFormModal.vue'

/**
 * The modal owns the create/update mutations + the success toast and the
 * client-side validation that mirrors the backend rules. We stub the
 * auto-imported mutations/toast and assert: create-vs-edit title + prefill, the
 * create/update payloads (subtitle/link empty ⇒ null), each validation guard
 * (title required, image_url required, ends>starts), error rendering, and a11y.
 * URL/verb mapping is pinned in the query spec.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
    // USwitch renders button[role=switch] wrapping a visually-hidden input —
    // axe flags it as nested-interactive (library artifact). Same as warehouses.
    'nested-interactive': { enabled: false },
  },
}

const { createMutate, updateMutate, toastAdd } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useCreateBanner', () => () => ({
  mutateAsync: createMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useUpdateBanner', () => () => ({
  mutateAsync: updateMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

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
  title: 'Winter sale',
  subtitle: 'Up to 50% off',
  image_url: 'https://cdn/winter.jpg',
  link_url: 'https://shop/winter',
  placement: 'home_hero' as const,
  sort_order: 2,
  starts_at: null,
  ends_at: null,
  is_active: true,
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

describe('BannerFormModal', () => {
  it('shows the create title when no banner is passed', async () => {
    await mountSuspended(BannerFormModal, { props: { open: true, banner: null } })
    expect(document.body.textContent).toContain('New banner')
  })

  it('prefills and shows the edit title when a banner is passed', async () => {
    await mountSuspended(BannerFormModal, { props: { open: true, banner: existing } })
    expect(document.body.textContent).toContain('Edit banner')
    const values = [...document.querySelectorAll('input')].map(i => i.value)
    expect(values).toContain('Winter sale')
    expect(values).toContain('https://cdn/winter.jpg')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(BannerFormModal, { props: { open: true, banner: null } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('creates a banner (subtitle/link empty ⇒ null) on save', async () => {
    const wrapper = await mountSuspended(BannerFormModal, {
      props: { open: true, banner: null },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    // [0] = title, [1] = image_url, [2] = link_url, [3] = starts_at, [4] = ends_at
    // (subtitle is a UTextarea).
    inputs[0]!.vm.$emit('update:modelValue', 'Spring hero')
    inputs[1]!.vm.$emit('update:modelValue', 'https://cdn/spring.jpg')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0]![0]
    expect(body).toMatchObject({
      title: 'Spring hero',
      image_url: 'https://cdn/spring.jpg',
      subtitle: null,
      link_url: null,
      placement: 'home_hero',
      sort_order: 0,
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('rejects a missing title without calling the mutation', async () => {
    const wrapper = await mountSuspended(BannerFormModal, {
      props: { open: true, banner: null },
    })
    // Only set the image URL; leave title blank.
    wrapper.findAllComponents({ name: 'UInput' })[1]!.vm.$emit('update:modelValue', 'https://cdn/x.jpg')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('rejects a missing image URL without calling the mutation', async () => {
    const wrapper = await mountSuspended(BannerFormModal, {
      props: { open: true, banner: null },
    })
    // Only set the title; leave image URL blank.
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Headless')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('rejects an end date on/before the start date', async () => {
    const wrapper = await mountSuspended(BannerFormModal, {
      props: { open: true, banner: null },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    inputs[0]!.vm.$emit('update:modelValue', 'Window')
    inputs[1]!.vm.$emit('update:modelValue', 'https://cdn/x.jpg')
    inputs[3]!.vm.$emit('update:modelValue', '2026-06-10T10:00') // starts_at
    inputs[4]!.vm.$emit('update:modelValue', '2026-06-01T10:00') // ends_at (before)
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('updates an existing banner on save (PATCH payload)', async () => {
    const wrapper = await mountSuspended(BannerFormModal, {
      props: { open: true, banner: existing },
    })
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 9)
    await tick()

    clickSave()
    await tick()

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const { id, patch } = updateMutate.mock.calls[0]![0]
    expect(id).toBe(7)
    expect(patch).toMatchObject({
      title: 'Winter sale',
      image_url: 'https://cdn/winter.jpg',
      placement: 'home_hero',
      sort_order: 9,
    })
  })

  it('shows an error alert and no toast when the mutation fails', async () => {
    createMutate.mockRejectedValue({ data: { detail: 'Invalid placement' } })
    const wrapper = await mountSuspended(BannerFormModal, {
      props: { open: true, banner: null },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    inputs[0]!.vm.$emit('update:modelValue', 'Boom')
    inputs[1]!.vm.$emit('update:modelValue', 'https://cdn/x.jpg')
    await tick()

    clickSave()
    await tick()

    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Invalid placement')
    expect(toastAdd).not.toHaveBeenCalled()
  })
})
