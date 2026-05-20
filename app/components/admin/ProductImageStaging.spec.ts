// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductImageStaging from './ProductImageStaging.vue'

const createObjectURL = vi.fn((file: File) => `blob:mock/${file.name}`)
const revokeObjectURL = vi.fn()

beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  // happy-dom doesn't implement URL.createObjectURL — stub before each mount.
  Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL })
})

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(sizeBytes)], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

async function tick() {
  await new Promise(r => setTimeout(r, 0))
}

async function dropFiles(wrapper: Awaited<ReturnType<typeof mountSuspended>>, files: File[]) {
  const input = wrapper.find('input[type="file"]').element as HTMLInputElement
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await tick()
  await tick()
}

describe('ProductImageStaging', () => {
  it('renders the drop zone copy in the empty state', async () => {
    const wrapper = await mountSuspended(ProductImageStaging)
    expect(wrapper.html()).toContain('Drop images here')
    expect(wrapper.html()).toContain('JPEG, PNG, WebP')
    expect(wrapper.findAll('li').length).toBe(0)
    expect(wrapper.emitted('update:files')).toBeUndefined()
  })

  it('accepts a valid JPEG, renders a thumbnail and emits update:files', async () => {
    const wrapper = await mountSuspended(ProductImageStaging)
    const ok = makeFile('photo.jpg', 'image/jpeg', 200_000)
    await dropFiles(wrapper, [ok])

    expect(createObjectURL).toHaveBeenCalledWith(ok)
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('blob:mock/photo.jpg')
    const emits = wrapper.emitted('update:files')
    expect(emits).toBeTruthy()
    expect(emits!.at(-1)).toEqual([[ok]])
  })

  it('rejects an oversize file with an inline error and no emit', async () => {
    const wrapper = await mountSuspended(ProductImageStaging)
    const tooBig = makeFile('huge.jpg', 'image/jpeg', 6 * 1024 * 1024)
    await dropFiles(wrapper, [tooBig])

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(wrapper.findAll('img').length).toBe(0)
    expect(wrapper.html()).toContain('huge.jpg')
    expect(wrapper.html()).toMatch(/larger than|5 MB/)
    expect(wrapper.emitted('update:files')).toBeUndefined()
  })

  it('rejects an unsupported MIME type with an inline error', async () => {
    const wrapper = await mountSuspended(ProductImageStaging)
    const bad = makeFile('vector.svg', 'image/svg+xml', 1024)
    await dropFiles(wrapper, [bad])

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(wrapper.findAll('img').length).toBe(0)
    expect(wrapper.html()).toContain('vector.svg')
    expect(wrapper.html()).toMatch(/not a supported|JPEG/)
  })

  it('renders a Primary badge on the first tile only', async () => {
    const wrapper = await mountSuspended(ProductImageStaging)
    const a = makeFile('a.jpg', 'image/jpeg', 100_000)
    const b = makeFile('b.png', 'image/png', 100_000)
    await dropFiles(wrapper, [a, b])

    const tiles = wrapper.findAll('li')
    expect(tiles.length).toBe(2)
    expect(tiles[0]!.html()).toContain('Primary')
    expect(tiles[1]!.html()).not.toContain('>Primary<')

    const emits = wrapper.emitted('update:files')!
    const lastEmit = emits.at(-1)![0] as File[]
    expect(lastEmit).toHaveLength(2)
    expect(lastEmit[0]!.name).toBe('a.jpg')
    expect(lastEmit[1]!.name).toBe('b.png')
  })

  it('removes a tile when its remove button is clicked and revokes the preview URL', async () => {
    const wrapper = await mountSuspended(ProductImageStaging)
    const a = makeFile('keep.jpg', 'image/jpeg', 100_000)
    const b = makeFile('drop.jpg', 'image/jpeg', 100_000)
    await dropFiles(wrapper, [a, b])

    const removeBtn = wrapper.find('[aria-label*="drop.jpg"]')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')
    await tick()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/drop.jpg')
    const tiles = wrapper.findAll('li')
    expect(tiles.length).toBe(1)
    expect(tiles[0]!.html()).toContain('keep.jpg')

    const emits = wrapper.emitted('update:files')!
    const lastEmit = emits.at(-1)![0] as File[]
    expect(lastEmit).toEqual([a])
  })

  it('disables the file input when disabled prop is true', async () => {
    const wrapper = await mountSuspended(ProductImageStaging, {
      props: { disabled: true },
    })
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement
    expect(input.disabled).toBe(true)
    const dropZone = wrapper.find('[role="button"]')
    expect(dropZone.attributes('aria-disabled')).toBe('true')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductImageStaging)
    await dropFiles(wrapper, [makeFile('a.jpg', 'image/jpeg', 100_000)])
    expect(await axe(wrapper.html(), {
      rules: {
        'region': { enabled: false },
        'aria-hidden-focus': { enabled: false },
      },
    })).toHaveNoViolations()
  })
})
