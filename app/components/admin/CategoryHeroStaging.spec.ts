// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import CategoryHeroStaging from './CategoryHeroStaging.vue'

function makePngFile(name = 'hero.png', size = 1000): File {
  const blob = new Blob([new Uint8Array(size)], { type: 'image/png' })
  return new File([blob], name, { type: 'image/png' })
}

function makeOversizedFile(name = 'huge.png'): File {
  // 6 MiB; staging cap is 5 MiB.
  const blob = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' })
  return new File([blob], name, { type: 'image/png' })
}

function makeBadTypeFile(name = 'doc.pdf'): File {
  const blob = new Blob([new Uint8Array(10)], { type: 'application/pdf' })
  return new File([blob], name, { type: 'application/pdf' })
}

beforeEach(() => {
  // happy-dom doesn't implement URL.createObjectURL — patch the two static
  // methods directly so we don't replace the URL constructor (which other
  // code in Nuxt UI / our component imports uses for new URL(...) calls).
  vi.spyOn(URL, 'createObjectURL').mockImplementation((_: Blob | MediaSource) => 'blob://mocked')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('CategoryHeroStaging', () => {
  it('shows the drop zone when no existing hero and nothing staged', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging)
    expect(wrapper.find('[data-hero-drop-zone]').exists()).toBe(true)
    expect(wrapper.find('[data-hero-preview]').exists()).toBe(false)
  })

  it('shows the preview tile when an existing hero URL is provided', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging, {
      props: { existingUrl: 'https://r2/h.jpg', existingAlt: 'Alt' },
    })
    expect(wrapper.find('[data-hero-preview]').exists()).toBe(true)
    expect(wrapper.find('[data-hero-drop-zone]').exists()).toBe(false)
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('https://r2/h.jpg')
  })

  it('emits update:file with the staged File when one is picked', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging)
    const input = wrapper.find('input[data-hero-file-input]').element as HTMLInputElement
    const file = makePngFile()
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 0))
    const events = wrapper.emitted('update:file') as Array<[File | null]> | undefined
    expect(events?.[events.length - 1]?.[0]).toBe(file)
  })

  it('rejects oversized files with a visible error and no emit', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging)
    const input = wrapper.find('input[data-hero-file-input]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeOversizedFile()], configurable: true })
    input.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.find('[data-hero-error]').text()).toContain('5 MiB')
    expect(wrapper.emitted('update:file')).toBeUndefined()
  })

  it('rejects unsupported mime types', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging)
    const input = wrapper.find('input[data-hero-file-input]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeBadTypeFile()], configurable: true })
    input.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.find('[data-hero-error]').text()).toMatch(/Unsupported|JPEG/i)
    expect(wrapper.emitted('update:file')).toBeUndefined()
  })

  it('emits removeExisting when Remove is clicked on an existing hero', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging, {
      props: { existingUrl: 'https://r2/h.jpg' },
    })
    const removeBtn = [...wrapper.findAll('button')].find(b =>
      b.text().trim() === 'Remove',
    )
    expect(removeBtn).toBeTruthy()
    await removeBtn!.trigger('click')
    expect(wrapper.emitted('removeExisting')).toBeTruthy()
  })

  it('emits update:file null when staged file is cleared', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging)
    const input = wrapper.find('input[data-hero-file-input]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makePngFile()], configurable: true })
    input.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 0))
    const clearBtn = [...wrapper.findAll('button')].find(b => b.text().trim() === 'Clear')
    await clearBtn!.trigger('click')
    const events = wrapper.emitted('update:file') as Array<[File | null]>
    expect(events[events.length - 1]?.[0]).toBeNull()
  })

  it('hides the alt-text field when there is no image (F4)', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging)
    expect(wrapper.find('[data-hero-alt-field]').exists()).toBe(false)
  })

  it('shows the alt-text field seeded from existingAlt for an existing hero', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging, {
      props: { existingUrl: 'https://r2/h.jpg', existingAlt: 'Seeded alt' },
    })
    expect(wrapper.find('[data-hero-alt-field]').exists()).toBe(true)
    const altInput = wrapper.find('[data-hero-alt-field] input').element as HTMLInputElement
    expect(altInput.value).toBe('Seeded alt')
  })

  it('emits update:alt when the alt text is edited', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging, {
      props: { existingUrl: 'https://r2/h.jpg', existingAlt: '' },
    })
    const altInput = wrapper.find('[data-hero-alt-field] input').element as HTMLInputElement
    altInput.value = 'A red mug'
    altInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    const events = wrapper.emitted('update:alt') as Array<[string]> | undefined
    expect(events?.[events.length - 1]?.[0]).toBe('A red mug')
  })

  it('shows the alt field once a file is staged (no existing hero)', async () => {
    const wrapper = await mountSuspended(CategoryHeroStaging)
    const input = wrapper.find('input[data-hero-file-input]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makePngFile()], configurable: true })
    input.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.find('[data-hero-alt-field]').exists()).toBe(true)
  })
})
