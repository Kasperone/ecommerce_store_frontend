// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The collections list page renders each collection row (name, slug, status,
 * product count) and orchestrates create / update / delete plus the membership
 * PUT. We stub the query layer and assert: rows render, create POSTs with
 * type=manual, update also PUTs the ordered membership, delete fires the delete
 * mutation. URL/verb mapping is pinned in useCollectionQueries.spec.ts.
 */

const ROWS = [
  {
    id: 1,
    created_at: '2026-06-08T00:00:00Z',
    updated_at: '2026-06-08T00:00:00Z',
    name: 'Summer sale',
    slug: 'summer-sale',
    description: null,
    is_active: true,
    sort_order: 0,
    type: 'manual',
    product_count: 3,
    hero_image_url: null,
    hero_image_alt: null,
  },
  {
    id: 2,
    created_at: '2026-06-08T00:00:00Z',
    updated_at: '2026-06-08T00:00:00Z',
    name: 'Clearance',
    slug: 'clearance',
    description: null,
    is_active: false,
    sort_order: 5,
    type: 'manual',
    product_count: 0,
    hero_image_url: null,
    hero_image_alt: null,
  },
]

const listData = ref<unknown>(ROWS)
const listError = ref<unknown>(null)
const membersData = ref<unknown>([])

const createMutate = vi.fn().mockResolvedValue({ id: 9 })
const updateMutate = vi.fn().mockResolvedValue({ id: 1 })
const deleteMutate = vi.fn().mockResolvedValue(undefined)
const setProductsMutate = vi.fn().mockResolvedValue(undefined)
const uploadHeroMutate = vi.fn().mockResolvedValue({ id: 1 })

vi.mock('~/composables/queries/useCollectionQueries', () => ({
  useCollectionsQuery: () => ({ data: listData, error: listError }),
  useCollectionProductsQuery: () => ({ data: membersData }),
  useCreateCollection: () => ({ mutateAsync: createMutate, isLoading: ref(false) }),
  useUpdateCollection: () => ({ mutateAsync: updateMutate, isLoading: ref(false) }),
  useDeleteCollection: () => ({ mutateAsync: deleteMutate, isLoading: ref(false) }),
  useSetCollectionProducts: () => ({ mutateAsync: setProductsMutate, isLoading: ref(false) }),
  useUploadCollectionHero: () => ({ mutateAsync: uploadHeroMutate, isLoading: ref(false) }),
  useUpdateCollectionHeroAlt: () => ({ mutateAsync: vi.fn(), isLoading: ref(false) }),
  useDeleteCollectionHero: () => ({ mutateAsync: vi.fn(), isLoading: ref(false) }),
}))

mockNuxtImport('useRoute', () => () => ({ query: {} }))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

beforeEach(() => {
  listData.value = ROWS
  listError.value = null
  membersData.value = []
  createMutate.mockClear()
  updateMutate.mockClear()
  deleteMutate.mockClear()
  setProductsMutate.mockClear()
  uploadHeroMutate.mockClear()
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        ClientOnly: PassThroughStub,
        ErrorAlert: true,
        AdminCollectionFormModal: true,
        AdminCollectionDeleteConfirm: true,
      },
    },
  })
}

describe('admin/collections list page', () => {
  it('renders each collection row with name, slug and product count', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Summer sale')
    expect(wrapper.text()).toContain('/summer-sale')
    expect(wrapper.text()).toContain('Clearance')
  })

  it('shows the empty state when there are no collections', async () => {
    listData.value = []
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No collections yet')
  })

  it('creates a collection with type=manual', async () => {
    const wrapper = await mountPage()
    const modal = wrapper.findComponent({ name: 'AdminCollectionFormModal' })
    // The create modal is the first instance (collection=null).
    const createModal = wrapper.findAllComponents({ name: 'AdminCollectionFormModal' })[0]
    void modal
    createModal!.vm.$emit('submit', {
      name: 'Autumn', slug: 'autumn', description: null, is_active: true, sort_order: 0,
      name_pl: null, slug_pl: null, description_pl: null,
      meta_title: null, meta_description: null, meta_title_pl: null, meta_description_pl: null,
      heroFile: null, heroAlt: '', removeExistingHero: false, memberIds: [],
    })
    await new Promise(r => setTimeout(r, 0))

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0]![0]).toMatchObject({ name: 'Autumn', slug: 'autumn', type: 'manual' })
  })

  it('on edit submit updates the collection and PUTs the ordered membership', async () => {
    const wrapper = await mountPage()
    // Open the edit modal for row 1 (the pencil button).
    const editBtn = wrapper.find('button[aria-label="Edit collection"]')
    await editBtn.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    const editModal = wrapper.findAllComponents({ name: 'AdminCollectionFormModal' })[1]
    editModal!.vm.$emit('submit', {
      name: 'Summer sale', slug: 'summer-sale', description: null, is_active: true, sort_order: 0,
      name_pl: null, slug_pl: null, description_pl: null,
      meta_title: null, meta_description: null, meta_title_pl: null, meta_description_pl: null,
      heroFile: null, heroAlt: '', removeExistingHero: false, memberIds: [5, 3, 9],
    })
    await new Promise(r => setTimeout(r, 0))

    expect(updateMutate).toHaveBeenCalledTimes(1)
    expect(setProductsMutate).toHaveBeenCalledWith({ id: 1, productIds: [5, 3, 9] })
  })

  it('deletes a collection on confirm', async () => {
    const wrapper = await mountPage()
    const deleteBtn = wrapper.find('button[aria-label="Delete"]')
    await deleteBtn.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    const confirm = wrapper.findComponent({ name: 'AdminCollectionDeleteConfirm' })
    confirm.vm.$emit('confirm', 1)
    await new Promise(r => setTimeout(r, 0))

    expect(deleteMutate).toHaveBeenCalledWith(1)
  })
})
