// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import ImagePicker from './ImagePicker.vue'

/**
 * The CMS image_picker control: an R2 upload widget with a manual paste-URL
 * fallback. Uploading calls the media mutation and writes the returned URL to
 * the field; the manual input still works; a thumbnail renders when a URL is
 * set.
 */

const { mutateAsync, toastAdd } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastAdd: vi.fn(),
}))

vi.mock('~/composables/queries/useMediaQueries', () => ({
  useUploadCmsMedia: () => ({ mutateAsync }),
}))

mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  mutateAsync.mockReset()
  toastAdd.mockReset()
})

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(Math.min(sizeBytes, 8))], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

describe('AdminCmsImagePicker', () => {
  it('renders the upload zone + manual URL input', async () => {
    const w = await mountSuspended(ImagePicker, {
      props: { fieldId: 'image_url', modelValue: '' },
    })
    expect(w.text()).toContain('Upload image')
    expect(w.text()).toContain('Or paste a URL')
    // The manual fallback keeps the canonical control id.
    expect(w.find('#setting-image_url').exists()).toBe(true)
  })

  it('renders a thumbnail when a URL is set', async () => {
    const w = await mountSuspended(ImagePicker, {
      props: { fieldId: 'image_url', modelValue: 'https://cdn.example/img.jpg' },
    })
    expect(w.find('[data-testid="image-picker-thumbnail"]').exists()).toBe(true)
  })

  it('does not render a thumbnail when the URL is empty', async () => {
    const w = await mountSuspended(ImagePicker, {
      props: { fieldId: 'image_url', modelValue: '' },
    })
    expect(w.find('[data-testid="image-picker-thumbnail"]').exists()).toBe(false)
  })

  it('manual URL paste emits update:modelValue', async () => {
    const w = await mountSuspended(ImagePicker, {
      props: { fieldId: 'image_url', modelValue: '' },
    })
    await w.find('#setting-image_url').setValue('https://r2.example/hero.webp')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)![0]).toBe('https://r2.example/hero.webp')
  })

  it('upload calls the mutation and writes the returned url to the field', async () => {
    mutateAsync.mockResolvedValue({
      url: 'https://pub-abc.r2.dev/cms/deadbeef.webp',
      width: 1200,
      height: 600,
      bytes: 1234,
      mime: 'image/webp',
    })
    const w = await mountSuspended(ImagePicker, {
      props: { fieldId: 'image_url', modelValue: '' },
    })
    const file = makeFile('hero.webp', 'image/webp', 1000)
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    // Let the async upload settle.
    await new Promise(r => setTimeout(r, 0))
    await w.vm.$nextTick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const arg = mutateAsync.mock.calls[0]![0]
    expect(arg.formData).toBeInstanceOf(FormData)
    expect((arg.formData as FormData).get('file')).toBeTruthy()

    const emitted = w.emitted('update:modelValue')
    expect(emitted!.at(-1)![0]).toBe('https://pub-abc.r2.dev/cms/deadbeef.webp')
  })

  it('rejects an oversize file without calling the mutation (toasts an error)', async () => {
    const w = await mountSuspended(ImagePicker, {
      props: { fieldId: 'image_url', modelValue: '' },
    })
    const big = makeFile('big.png', 'image/png', 6 * 1024 * 1024)
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [big], configurable: true })
    await input.trigger('change')
    await new Promise(r => setTimeout(r, 0))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledTimes(1)
  })

  it('surfaces an upload failure via a toast', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'))
    const w = await mountSuspended(ImagePicker, {
      props: { fieldId: 'image_url', modelValue: '' },
    })
    const file = makeFile('ok.jpg', 'image/jpeg', 1000)
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await new Promise(r => setTimeout(r, 0))
    await w.vm.$nextTick()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(toastAdd).toHaveBeenCalledTimes(1)
    // No URL written on failure.
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })
})
