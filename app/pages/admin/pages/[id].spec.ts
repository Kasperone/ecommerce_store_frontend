// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The CMS page editor wires the section list, schema form, live preview, and the
 * save-draft / publish / rollback mutations to the page endpoints. We stub the
 * queries (page detail, block schema, versions) and the mutations, then assert
 * the toolbar contract: unsaved badge, save-draft + publish payloads, and the
 * version-history rollback call.
 */

const PAGE = {
  id: 5,
  slug: 'home',
  type: 'home',
  locale: 'en',
  status: 'draft',
  draft_layout: { sections: [{ type: 'hero', settings: { heading: 'Hi' } }] },
  published_layout: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

const SCHEMAS = {
  blocks: [
    { type: 'hero', name: 'Hero', settings: [{ type: 'text', id: 'heading', label: 'Heading' }], presets: [{ name: 'Hero', settings: {} }] },
    { type: 'spacer', name: 'Spacer', settings: [], presets: [{ name: 'Spacer', settings: { height: 48 } }] },
    {
      type: 'slideshow',
      name: 'Slideshow',
      settings: [],
      blocks: { slide: { name: 'Slide', settings: [{ type: 'text', id: 'heading', label: 'Heading' }] } },
      presets: [{ name: 'Slideshow', settings: {} }],
    },
  ],
}

const VERSIONS = {
  items: [
    { id: 21, page_id: 5, version_no: 2, label: 'v2', created_at: '2026-06-02T10:00:00Z' },
    { id: 20, page_id: 5, version_no: 1, label: null, created_at: '2026-06-01T10:00:00Z' },
  ],
  total: 2,
}

const pageData = ref<unknown>(PAGE)
const pageError = ref<unknown>(null)
const versionData = ref<unknown>(VERSIONS)

const saveMock = vi.fn().mockResolvedValue(PAGE)
const publishMock = vi.fn().mockResolvedValue({ ...PAGE, status: 'published' })
const rollbackMock = vi.fn().mockResolvedValue(PAGE)
const previewTokenMock = vi.fn().mockResolvedValue({ token: 'tok-xyz', expires_at: '2026-06-05T00:10:00Z' })
const refetchVersions = vi.fn().mockResolvedValue(undefined)

// Capture the guard registered via `onBeforeRouteLeave` so we can invoke it
// directly — router navigation can't drive a non-route-mounted component.
type LeaveGuard = (...args: unknown[]) => unknown
const { leaveGuards } = vi.hoisted(() => ({ leaveGuards: [] as LeaveGuard[] }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    onBeforeRouteLeave: (guard: LeaveGuard) => {
      leaveGuards.push(guard)
    },
  }
})

vi.mock('~/composables/queries/usePageQueries', () => ({
  usePageQuery: () => ({ data: pageData, error: pageError }),
  useBlockSchemasQuery: () => ({ data: ref(SCHEMAS) }),
  usePageVersionsQuery: () => ({ data: versionData, refetch: refetchVersions }),
  useSavePageDraft: () => ({ mutateAsync: saveMock, isLoading: ref(false) }),
  usePublishPage: () => ({ mutateAsync: publishMock, isLoading: ref(false) }),
  useRollbackPageVersion: () => ({ mutateAsync: rollbackMock, isLoading: ref(false) }),
  useCreatePreviewToken: () => ({ mutateAsync: previewTokenMock, isLoading: ref(false) }),
}))

mockNuxtImport('useRoute', () => () => ({ params: { id: '5' }, query: {} }))
// `useLocalePath` returns an identity path resolver in tests (no /pl/ prefix
// for the default locale) — enough to assert the preview/live URL shape.
mockNuxtImport('useLocalePath', () => () => (p: string) => p)

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const ButtonStub = defineComponent({
  props: { disabled: { type: Boolean, default: false }, ariaLabel: { type: String, default: '' } },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', {
      'disabled': props.disabled,
      'aria-label': props.ariaLabel,
      'onClick': () => !props.disabled && emit('click'),
    }, slots.default?.())
  },
})

// Stubs that expose just enough surface for the editor's interactions.
const SectionListStub = defineComponent({
  name: 'AdminCmsSectionList',
  props: { modelValue: { type: Array, default: () => [] }, selectedId: { type: String, default: null }, typeNames: { type: Object, default: () => ({}) } },
  emits: ['update:modelValue', 'select', 'remove', 'move'],
  setup(props) {
    return () => h('div', { 'data-testid': 'section-list' }, `sections:${(props.modelValue as unknown[]).length}`)
  },
})

// Renders the #body slot (where the version list / publish form live) and, when
// it carries a submit contract (AdminFormModal), a test button to fire @submit.
const ModalStub = defineComponent({
  name: 'UModal',
  props: { open: { type: Boolean, default: false } },
  setup(_props, { slots }) {
    return () => h('div', [slots.body?.(), slots.default?.()])
  },
})

const FormModalStub = defineComponent({
  name: 'AdminFormModal',
  props: { open: { type: Boolean, default: false }, title: { type: String, default: '' } },
  emits: ['submit', 'cancel', 'update:open'],
  setup(props, { slots, emit }) {
    return () => h('div', { 'data-testid': 'form-modal', 'data-title': props.title, 'data-open': String(props.open) }, [
      slots.body?.(),
      h('button', { 'data-testid': 'form-modal-submit', 'onClick': () => emit('submit') }, 'modal-submit'),
      h('button', { 'data-testid': 'form-modal-cancel', 'onClick': () => emit('cancel') }, 'modal-cancel'),
    ])
  },
})

const SubBlockListStub = defineComponent({
  name: 'AdminCmsSubBlockList',
  props: {
    modelValue: { type: Array, default: () => [] },
    childSchemas: { type: Object, default: () => ({}) },
    selectedChildId: { type: String, default: null },
  },
  emits: ['add', 'select', 'remove', 'move', 'reorder', 'update:modelValue'],
  setup(props) {
    return () => h('div', { 'data-testid': 'sub-block-list' }, `children:${(props.modelValue as unknown[]).length}`)
  },
})

// Device toggle stub: exposes one button per device that emits the model so we
// can assert the editor binds the resulting frame width.
const DevicePreviewStub = defineComponent({
  name: 'AdminCmsDevicePreview',
  props: { modelValue: { type: String, default: 'desktop' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', { 'data-testid': 'device-toggle', 'data-device': props.modelValue }, [
      h('button', { 'data-testid': 'device-desktop', 'onClick': () => emit('update:modelValue', 'desktop') }, 'desktop'),
      h('button', { 'data-testid': 'device-tablet', 'onClick': () => emit('update:modelValue', 'tablet') }, 'tablet'),
      h('button', { 'data-testid': 'device-mobile', 'onClick': () => emit('update:modelValue', 'mobile') }, 'mobile'),
    ])
  },
})

const AddModalStub = defineComponent({
  name: 'AdminCmsAddSectionModal',
  props: { open: { type: Boolean, default: false }, schemas: { type: Array, default: () => [] } },
  emits: ['update:open', 'pick'],
  setup(props, { emit }) {
    return () => h('button', {
      'data-testid': 'add-pick',
      'onClick': () => emit('pick', { type: 'spacer', settings: { height: 48 } }),
    }, props.open ? 'add-open' : 'add-closed')
  },
})

async function mountEditor() {
  const Page = (await import('./[id].vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        ClientOnly: PassThroughStub,
        UButton: ButtonStub,
        UBadge: PassThroughStub,
        UFormField: PassThroughStub,
        UInput: true,
        UModal: ModalStub,
        AdminFormModal: FormModalStub,
        AdminCmsSettingsForm: true,
        AdminCmsSubBlockList: SubBlockListStub,
        PageRenderer: true,
        AdminCmsSectionList: SectionListStub,
        AdminCmsAddSectionModal: AddModalStub,
        AdminCmsDevicePreview: DevicePreviewStub,
      },
    },
  })
}

beforeEach(() => {
  pageData.value = PAGE
  pageError.value = null
  versionData.value = VERSIONS
  saveMock.mockClear()
  publishMock.mockClear()
  rollbackMock.mockClear()
  previewTokenMock.mockClear()
  refetchVersions.mockClear()
  leaveGuards.length = 0
})

describe('admin/pages editor', () => {
  it('renders the page slug, status, and the section list', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('/home')
    expect(wrapper.find('[data-testid="section-list"]').text()).toContain('sections:1')
  })

  it('shows the unsaved badge after adding a section, then saves the draft', async () => {
    const wrapper = await mountEditor()
    // Add a section via the stubbed picker.
    await wrapper.find('[data-testid="add-pick"]').trigger('click')
    expect(wrapper.text()).toContain('Unsaved changes')

    const saveBtn = [...wrapper.findAll('button')].find(b => b.text().trim() === 'Save draft')
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(saveMock).toHaveBeenCalledTimes(1)
    const arg = saveMock.mock.calls[0][0]
    expect(arg.id).toBe(5)
    // The added spacer makes 2 sections in the saved layout.
    expect(arg.patch.draft_layout.sections).toHaveLength(2)
  })

  it('publishes the page (POST publish) from the publish modal', async () => {
    const wrapper = await mountEditor()
    const publishBtn = [...wrapper.findAll('button')].find(b => b.text().trim() === 'Publish')
    await publishBtn!.trigger('click')
    // Submit the publish modal via the stubbed AdminFormModal submit button.
    await wrapper.find('[data-testid="form-modal-submit"]').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(publishMock).toHaveBeenCalledTimes(1)
    expect(publishMock.mock.calls[0][0].id).toBe(5)
  })

  it('lists versions and rolls back to a chosen version', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('Version 2')
    expect(wrapper.text()).toContain('Version 1')

    const restoreBtn = [...wrapper.findAll('button')].find(b => b.text().trim() === 'Restore')
    expect(restoreBtn).toBeTruthy()
    await restoreBtn!.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(rollbackMock).toHaveBeenCalledTimes(1)
    expect(rollbackMock.mock.calls[0][0]).toMatchObject({ id: 5, versionId: 21 })
  })

  it('registers an unsaved-changes route-leave guard', async () => {
    await mountEditor()
    expect(leaveGuards).toHaveLength(1)
  })

  it('allows leaving freely when the draft is clean', async () => {
    await mountEditor()
    const guard = leaveGuards[0]!
    // Not dirty on load → guard returns true (allow) without opening the modal.
    expect(guard()).toBe(true)
  })

  it('opens the confirm modal and blocks the leave while dirty', async () => {
    const wrapper = await mountEditor()
    // Make the editor dirty.
    await wrapper.find('[data-testid="add-pick"]').trigger('click')
    expect(wrapper.text()).toContain('Unsaved changes')

    const guard = leaveGuards[0]!
    const result = guard()
    // Dirty → guard returns a pending promise (navigation deferred).
    expect(result).toBeInstanceOf(Promise)
    await wrapper.vm.$nextTick()

    // The unsaved-changes confirm modal is now open.
    const guardModal = [...wrapper.findAll('[data-testid="form-modal"]')]
      .find(n => n.attributes('data-title') === 'Unsaved changes')
    expect(guardModal).toBeTruthy()
    expect(guardModal!.attributes('data-open')).toBe('true')

    // Confirming "leave" resolves the guard to true (navigation proceeds).
    await guardModal!.find('[data-testid="form-modal-submit"]').trigger('click')
    await expect(result).resolves.toBe(true)
  })

  it('cancelling the confirm modal keeps the user on the page', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="add-pick"]').trigger('click')

    const guard = leaveGuards[0]!
    const result = guard() as Promise<boolean>
    await wrapper.vm.$nextTick()

    const guardModal = [...wrapper.findAll('[data-testid="form-modal"]')]
      .find(n => n.attributes('data-title') === 'Unsaved changes')!
    await guardModal.find('[data-testid="form-modal-cancel"]').trigger('click')
    await expect(result).resolves.toBe(false)
  })

  it('shows the Preview draft button; clicking it saves then opens with the token', async () => {
    const openSpy = vi.fn(() => ({ location: { href: '' } }) as unknown as Window)
    vi.stubGlobal('open', openSpy)

    const wrapper = await mountEditor()
    // Make the draft dirty so the preview flow flushes the draft first.
    await wrapper.find('[data-testid="add-pick"]').trigger('click')

    const previewBtn = wrapper.find('[data-testid="preview-draft"]')
    expect(previewBtn.exists()).toBe(true)
    await previewBtn.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    // A placeholder tab is opened synchronously on click (popup-blocker safe).
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    // Dirty draft is saved before minting the token.
    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(previewTokenMock).toHaveBeenCalledWith({ id: 5 })
    // The opened tab is redirected to the public preview URL with the token.
    const openedTab = openSpy.mock.results[0]!.value as { location: { href: string } }
    expect(openedTab.location.href).toBe('/home?token=tok-xyz')

    vi.unstubAllGlobals()
  })

  it('hides View live for a draft page and shows it once published', async () => {
    const draftWrapper = await mountEditor()
    expect(draftWrapper.find('[data-testid="view-live"]').exists()).toBe(false)

    pageData.value = { ...PAGE, status: 'published' }
    const publishedWrapper = await mountEditor()
    expect(publishedWrapper.find('[data-testid="view-live"]').exists()).toBe(true)
  })

  it('shows the sub-block list when a container (slideshow) section is selected', async () => {
    pageData.value = {
      ...PAGE,
      draft_layout: {
        sections: [
          { type: 'slideshow', settings: {}, blocks: [{ type: 'slide', id: 'slide-0', settings: {} }] },
        ],
      },
    }
    const wrapper = await mountEditor()
    const sub = wrapper.find('[data-testid="sub-block-list"]')
    expect(sub.exists()).toBe(true)
    expect(sub.text()).toContain('children:1')
  })

  it('hides the sub-block list for a non-container (hero) section', async () => {
    // Default PAGE has a single hero section.
    const wrapper = await mountEditor()
    expect(wrapper.find('[data-testid="sub-block-list"]').exists()).toBe(false)
  })

  it('renders a page-load error via ErrorAlert', async () => {
    pageData.value = null
    pageError.value = { data: { detail: 'Not found' } }
    const wrapper = await mountEditor()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Not found')
  })

  it('defaults the preview frame to full width (Desktop)', async () => {
    const wrapper = await mountEditor()
    const frame = wrapper.find('[data-testid="preview-device-frame"]')
    expect(frame.exists()).toBe(true)
    // Desktop = no max-width constraint.
    expect(frame.attributes('style') ?? '').not.toContain('max-width')
  })

  it('constrains the preview frame width when a device is selected', async () => {
    const wrapper = await mountEditor()
    await wrapper.find('[data-testid="device-mobile"]').trigger('click')
    await wrapper.vm.$nextTick()
    const frame = wrapper.find('[data-testid="preview-device-frame"]')
    expect(frame.attributes('style')).toContain('max-width: 375px')

    await wrapper.find('[data-testid="device-tablet"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="preview-device-frame"]').attributes('style')).toContain('max-width: 768px')

    // Back to Desktop restores full width.
    await wrapper.find('[data-testid="device-desktop"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="preview-device-frame"]').attributes('style') ?? '').not.toContain('max-width')
  })
})
