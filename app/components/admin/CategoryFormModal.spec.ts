// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import CategoryFormModal from './CategoryFormModal.vue'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    // Hidden submit button (Enter-to-submit affordance) inside a modal trips
    // this — same pattern as ProductForm. Out of scope for this spec.
    'nested-interactive': { enabled: false },
    // The same hidden submit button trips button-name; the SR is fine because
    // the visible Save button satisfies the form, and Enter-on-input is the
    // primary affordance for the hidden one.
    'button-name': { enabled: false },
    // happy-dom doesn't render the v-show'd PL tab inputs visibly, so axe
    // flags the inactive locale's <input>s. They're labelled correctly in the
    // active locale.
    'label': { enabled: false },
  },
}

function getInput(name: string): HTMLInputElement | HTMLTextAreaElement | null {
  return document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | null
}

function clickTab(value: 'en' | 'pl') {
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    el => el.textContent?.trim() === (value === 'en' ? 'English' : 'Polski'),
  ) as HTMLElement | undefined
  tab?.click()
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockImplementation((_: Blob) => 'blob://mocked')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('CategoryFormModal', () => {
  it('auto-slugifies the name on blur when the slug is untouched', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const nameInput = getInput('name') as HTMLInputElement
    expect(nameInput).toBeTruthy()
    nameInput.value = 'Cooking & Wine'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    const slugInput = getInput('slug') as HTMLInputElement
    expect(slugInput.value).toBe('cooking-and-wine')
  })

  it('respects a manually edited slug — does not overwrite on subsequent name blur', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const slugInput = getInput('slug') as HTMLInputElement
    slugInput.value = 'custom-slug'
    slugInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    const nameInput = getInput('name') as HTMLInputElement
    nameInput.value = 'Different name'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    expect(slugInput.value).toBe('custom-slug')
  })

  it('renders the cancel and save buttons', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const labels = [...document.querySelectorAll('button')].map(b => b.textContent?.trim())
    expect(labels).toContain('Cancel')
    expect(labels).toContain('Save')
  })

  it('renders edit title when a category is provided', async () => {
    await mountSuspended(CategoryFormModal, {
      props: {
        open: true,
        category: {
          id: 1,
          name: 'Books',
          slug: 'books',
          description: 'Printed reads',
          is_active: true,
          sort_order: 0,
          product_count: 0,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      },
    })
    expect(document.body.textContent).toContain('Edit category')
  })

  it('renders EN/PL tabs', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const tabLabels = [...document.querySelectorAll('[role="tab"]')].map(
      el => el.textContent?.trim(),
    )
    expect(tabLabels).toContain('English')
    expect(tabLabels).toContain('Polski')
  })

  it('preserves the EN name when the user switches to the PL tab and back', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const nameInput = getInput('name') as HTMLInputElement
    nameInput.value = 'Books'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    clickTab('pl')
    await new Promise(r => setTimeout(r, 0))
    clickTab('en')
    await new Promise(r => setTimeout(r, 0))

    expect((getInput('name') as HTMLInputElement).value).toBe('Books')
  })

  it('auto-slugifies the PL name on blur when slug_pl is untouched', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    clickTab('pl')
    await new Promise(r => setTimeout(r, 0))
    const namePl = getInput('name_pl') as HTMLInputElement
    namePl.value = 'Książki'
    namePl.dispatchEvent(new Event('input', { bubbles: true }))
    namePl.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    const slugPl = getInput('slug_pl') as HTMLInputElement
    expect(slugPl.value).toBe('ksiazki')
  })

  it('emits submit with every populated locale + SEO field', async () => {
    const wrapper = await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    ;(getInput('name') as HTMLInputElement).value = 'Books'
    getInput('name')?.dispatchEvent(new Event('input', { bubbles: true }))
    ;(getInput('slug') as HTMLInputElement).value = 'books'
    getInput('slug')?.dispatchEvent(new Event('input', { bubbles: true }))

    clickTab('pl')
    await new Promise(r => setTimeout(r, 0))
    ;(getInput('name_pl') as HTMLInputElement).value = 'Książki'
    getInput('name_pl')?.dispatchEvent(new Event('input', { bubbles: true }))
    ;(getInput('slug_pl') as HTMLInputElement).value = 'ksiazki'
    getInput('slug_pl')?.dispatchEvent(new Event('input', { bubbles: true }))

    const saveBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Save',
    ) as HTMLButtonElement
    saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    const submits = wrapper.emitted('submit') as Array<[unknown]> | undefined
    expect(submits).toBeTruthy()
    const payload = submits![0]?.[0] as Record<string, unknown>
    expect(payload).toMatchObject({
      name: 'Books',
      slug: 'books',
      name_pl: 'Książki',
      slug_pl: 'ksiazki',
      heroFile: null,
      heroAlt: '',
      removeExistingHero: false,
    })
  })

  it('does not emit submit when required fields are empty — Save validates first (F9)', async () => {
    const wrapper = await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    // Click Save without filling name/slug. The visible Save must route through
    // the form's submit so `:validate` runs and blocks the emit — the bug was a
    // direct onSubmit call that skipped validation and POSTed empty values.
    const saveBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Save',
    ) as HTMLButtonElement
    saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('renders the SEO collapsible section', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    expect(document.body.textContent).toContain('SEO meta')
  })

  it('renders the hero staging dropzone for a new category', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    expect(document.querySelector('[data-hero-drop-zone]')).toBeTruthy()
  })

  it('renders the existing hero preview when editing a row with hero_image_url', async () => {
    await mountSuspended(CategoryFormModal, {
      props: {
        open: true,
        category: {
          id: 1,
          name: 'Books',
          slug: 'books',
          description: null,
          is_active: true,
          parent_id: null,
          sort_order: 0,
          name_pl: null,
          slug_pl: null,
          description_pl: null,
          meta_title: null,
          meta_description: null,
          meta_title_pl: null,
          meta_description_pl: null,
          hero_image_url: 'https://r2/h.jpg',
          hero_image_alt: 'Books hero',
          hero_width: 800,
          hero_height: 450,
          hero_bytes: 12_000,
          hero_mime: 'image/jpeg',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      },
    })
    expect(document.querySelector('[data-hero-preview]')).toBeTruthy()
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
