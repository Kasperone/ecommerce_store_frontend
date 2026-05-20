// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

const { mockNavigateTo, createMutateAsync, uploadMutateAsync, setPrimaryMutateAsync, deleteMutateAsync } = vi.hoisted(() => ({
  mockNavigateTo: vi.fn(),
  createMutateAsync: vi.fn(),
  uploadMutateAsync: vi.fn(),
  setPrimaryMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
}))

mockNuxtImport('navigateTo', () => mockNavigateTo)

vi.mock('~/composables/queries/useProductQueries', () => ({
  useCreateProduct: () => ({ isLoading: { value: false }, mutateAsync: createMutateAsync }),
  useDeleteProduct: () => ({ isLoading: { value: false }, mutateAsync: deleteMutateAsync }),
}))

vi.mock('~/composables/queries/useProductImageQueries', () => ({
  useUploadProductImage: () => ({ isLoading: { value: false }, mutateAsync: uploadMutateAsync }),
  useUpdateProductImage: () => ({ isLoading: { value: false }, mutateAsync: setPrimaryMutateAsync }),
}))

vi.mock('~/composables/queries/useCategoryQueries', () => ({
  useCategoriesQuery: () => ({
    data: { value: [] },
    error: { value: null },
    isLoading: { value: false },
  }),
}))

// Stubs for the two child components. The form stub renders its extra-sections
// slot and exposes a button that emits 'submit' with a fixed payload; the
// staging stub exposes a button that emits 'update:files' with two fixed Files
// so we can drive the orchestration deterministically without happy-dom's
// File/Drop quirks.
const FORM_PAYLOAD = { name: 'P', slug: 'p', description: null, sku: null, price_usd: 1, price_pln: 1, price_eur: 1, stock: 0, is_active: true, is_featured: false, category_id: null }
const STAGED_FILES = [
  new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
  new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
]

const FormStub = defineComponent({
  name: 'AdminProductForm',
  emits: ['submit', 'cancel'],
  setup(_props, { emit, slots }) {
    return () => h('div', { 'data-testid': 'form-stub' }, [
      slots['extra-sections']?.(),
      h('button', {
        'data-testid': 'submit',
        'onClick': () => emit('submit', FORM_PAYLOAD),
      }, 'Submit'),
    ])
  },
})

const StagingStub = defineComponent({
  name: 'AdminProductImageStaging',
  emits: ['update:files'],
  setup(_props, { emit }) {
    return () => h('button', {
      'data-testid': 'stage-files',
      'onClick': () => emit('update:files', STAGED_FILES),
    }, 'Stage files')
  },
})

const StagingEmptyStub = defineComponent({
  name: 'AdminProductImageStaging',
  setup() {
    return () => h('div', { 'data-testid': 'staging-empty' })
  },
})

beforeEach(() => {
  mockNavigateTo.mockReset()
  createMutateAsync.mockReset()
  uploadMutateAsync.mockReset()
  setPrimaryMutateAsync.mockReset()
  deleteMutateAsync.mockReset()
})

async function tick() {
  await new Promise(r => setTimeout(r, 0))
}

// Stubs for Nuxt UI components and the admin layout — none of them are
// part of the orchestration we're testing here, and they pull in providers
// (TooltipProvider, color-mode, etc.) that mountSuspended doesn't wire up
// for raw pages.
const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const ButtonStub = defineComponent({
  emits: ['click'],
  setup(_props, { emit, slots }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})

async function mountPage(stagingStub = StagingStub) {
  const NewPage = (await import('./new.vue')).default
  return await mountSuspended(NewPage, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        UButton: ButtonStub,
        AdminProductForm: FormStub,
        AdminProductImageStaging: stagingStub,
      },
    },
  })
}

describe('admin/products/new (multi-step submit)', () => {
  it('happy path: create → upload×2 in order → set-primary on first → navigate', async () => {
    createMutateAsync.mockResolvedValue({ id: 42 })
    uploadMutateAsync
      .mockResolvedValueOnce({ id: 100 })
      .mockResolvedValueOnce({ id: 101 })
    setPrimaryMutateAsync.mockResolvedValue({})

    const wrapper = await mountPage()
    await wrapper.find('[data-testid="stage-files"]').trigger('click')
    await tick()
    await wrapper.find('[data-testid="submit"]').trigger('click')
    // Drain create → 2 uploads → set-primary → navigate.
    for (let i = 0; i < 6; i++) await tick()

    expect(createMutateAsync).toHaveBeenCalledTimes(1)
    expect(createMutateAsync).toHaveBeenCalledWith(FORM_PAYLOAD)

    expect(uploadMutateAsync).toHaveBeenCalledTimes(2)
    const firstUpload = uploadMutateAsync.mock.calls[0]![0]
    expect(firstUpload.productId).toBe(42)
    expect((firstUpload.formData.get('file') as File).name).toBe('a.jpg')
    const secondUpload = uploadMutateAsync.mock.calls[1]![0]
    expect(secondUpload.productId).toBe(42)
    expect((secondUpload.formData.get('file') as File).name).toBe('b.jpg')

    expect(setPrimaryMutateAsync).toHaveBeenCalledTimes(1)
    expect(setPrimaryMutateAsync).toHaveBeenCalledWith({
      productId: 42,
      imageId: 100,
      patch: { is_primary: true },
    })

    expect(deleteMutateAsync).not.toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/admin/products/42/edit',
      query: { created: '1' },
    })
  })

  it('happy path with no staged files: create → navigate, no uploads or set-primary', async () => {
    createMutateAsync.mockResolvedValue({ id: 7 })

    const wrapper = await mountPage(StagingEmptyStub)
    await wrapper.find('[data-testid="submit"]').trigger('click')
    for (let i = 0; i < 4; i++) await tick()

    expect(createMutateAsync).toHaveBeenCalledTimes(1)
    expect(uploadMutateAsync).not.toHaveBeenCalled()
    expect(setPrimaryMutateAsync).not.toHaveBeenCalled()
    expect(deleteMutateAsync).not.toHaveBeenCalled()
    expect(mockNavigateTo).toHaveBeenCalledWith({
      path: '/admin/products/7/edit',
      query: { created: '1' },
    })
  })

  it('upload mid-loop failure: compensating DELETE fires, no navigate', async () => {
    createMutateAsync.mockResolvedValue({ id: 42 })
    uploadMutateAsync
      .mockResolvedValueOnce({ id: 100 })
      .mockRejectedValueOnce(new Error('R2 503'))
    deleteMutateAsync.mockResolvedValue({})

    const wrapper = await mountPage()
    await wrapper.find('[data-testid="stage-files"]').trigger('click')
    await tick()
    await wrapper.find('[data-testid="submit"]').trigger('click')
    for (let i = 0; i < 6; i++) await tick()

    expect(uploadMutateAsync).toHaveBeenCalledTimes(2)
    expect(setPrimaryMutateAsync).not.toHaveBeenCalled()
    expect(deleteMutateAsync).toHaveBeenCalledTimes(1)
    expect(deleteMutateAsync).toHaveBeenCalledWith(42)
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('first upload failure: compensating DELETE, no set-primary, no navigate', async () => {
    createMutateAsync.mockResolvedValue({ id: 42 })
    uploadMutateAsync.mockRejectedValueOnce(new Error('boom'))
    deleteMutateAsync.mockResolvedValue({})

    const wrapper = await mountPage()
    await wrapper.find('[data-testid="stage-files"]').trigger('click')
    await tick()
    await wrapper.find('[data-testid="submit"]').trigger('click')
    for (let i = 0; i < 6; i++) await tick()

    expect(uploadMutateAsync).toHaveBeenCalledTimes(1)
    expect(setPrimaryMutateAsync).not.toHaveBeenCalled()
    expect(deleteMutateAsync).toHaveBeenCalledWith(42)
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('create failure: no uploads, no delete, no navigate', async () => {
    createMutateAsync.mockRejectedValueOnce({ data: { detail: 'invalid' } })

    const wrapper = await mountPage()
    await wrapper.find('[data-testid="stage-files"]').trigger('click')
    await tick()
    await wrapper.find('[data-testid="submit"]').trigger('click')
    for (let i = 0; i < 4; i++) await tick()

    expect(uploadMutateAsync).not.toHaveBeenCalled()
    expect(deleteMutateAsync).not.toHaveBeenCalled()
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('delete failure is tolerated: no unhandled rejection, navigate still skipped', async () => {
    createMutateAsync.mockResolvedValue({ id: 42 })
    uploadMutateAsync.mockRejectedValueOnce(new Error('upload boom'))
    deleteMutateAsync.mockRejectedValueOnce(new Error('delete boom'))

    const wrapper = await mountPage()
    await wrapper.find('[data-testid="stage-files"]').trigger('click')
    await tick()
    await wrapper.find('[data-testid="submit"]').trigger('click')
    for (let i = 0; i < 6; i++) await tick()

    expect(deleteMutateAsync).toHaveBeenCalledWith(42)
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })
})
