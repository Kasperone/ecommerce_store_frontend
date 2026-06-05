// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The CMS pages list renders the paginated rows (slug, type, status) with
 * status/type/locale filters and a "New page" CTA that opens the create modal.
 * We stub the list/create queries + Nuxt UI primitives.
 */

const ROWS = {
  items: [
    {
      id: 1,
      slug: 'home',
      type: 'home',
      locale: 'en',
      status: 'published',
      seo_title: 'Welcome',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    },
    {
      id: 2,
      slug: 'about-us',
      type: 'standard',
      locale: 'pl',
      status: 'draft',
      seo_title: null,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-03T00:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  pages: 1,
}

const listData = ref<unknown>(ROWS)
const listError = ref<unknown>(null)
const createMock = vi.fn().mockResolvedValue({ id: 99 })

vi.mock('~/composables/queries/usePageQueries', () => ({
  usePagesQuery: () => ({ data: listData, error: listError }),
  useCreatePage: () => ({ mutateAsync: createMock, isLoading: ref(false) }),
}))

mockNuxtImport('useRoute', () => () => ({ query: {} }))
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mockNavigate)

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const ButtonStub = defineComponent({
  props: { ariaLabel: { type: String, default: '' } },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', {
      'aria-label': props.ariaLabel,
      'onClick': () => emit('click'),
    }, slots.default?.())
  },
})

const TableStub = defineComponent({
  name: 'UTable',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('table', {}, (props.data as Record<string, unknown>[]).map(row =>
      h('tr', { key: row.id as number }, [
        h('td', {}, slots['slug-cell']?.({ row: { original: row } })),
        h('td', {}, slots['type-cell']?.({ row: { original: row } })),
        h('td', {}, slots['locale-cell']?.({ row: { original: row } })),
        h('td', {}, slots['status-cell']?.({ row: { original: row } })),
        h('td', {}, slots['updated_at-cell']?.({ row: { original: row } })),
        h('td', {}, slots['actions-cell']?.({ row: { original: row } })),
      ]),
    ))
  },
})

beforeEach(() => {
  listData.value = ROWS
  listError.value = null
  createMock.mockClear()
  mockNavigate.mockClear()
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        NuxtLink: PassThroughStub,
        UButton: ButtonStub,
        UTable: TableStub,
        UFormField: PassThroughStub,
        UBadge: PassThroughStub,
        USelect: true,
        UPagination: true,
        AdminFormModal: true,
      },
    },
  })
}

describe('admin/pages list', () => {
  it('renders each page row (slug + type + status)', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('home')
    expect(wrapper.text()).toContain('about-us')
    expect(wrapper.text()).toContain('Published')
    expect(wrapper.text()).toContain('Draft')
  })

  it('shows the empty state when there are no pages', async () => {
    listData.value = { items: [], total: 0, page: 1, page_size: 20, pages: 0 }
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No pages yet')
  })

  it('opens the create modal from the New page CTA', async () => {
    const wrapper = await mountPage()
    const modal = wrapper.findComponent({ name: 'AdminFormModal' })
    expect(modal.props('open')).toBe(false)
    const create = [...wrapper.findAll('button')].find(b => b.text().trim() === 'New page')
    expect(create).toBeTruthy()
    await create!.trigger('click')
    expect(modal.props('open')).toBe(true)
  })

  it('renders the list error via ErrorAlert', async () => {
    listError.value = { data: { detail: 'Boom' } }
    const wrapper = await mountPage()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Boom')
  })
})
