// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The translations workspace's editor modal must disable its Save button while
 * the update mutation is in flight (Colada's `asyncStatus === 'loading'`; its
 * `status` is pending|success|error and never 'loading', which is the bug this
 * pins). The query layer is stubbed; the Save click and in-flight state drive
 * the real UModal/UButton.
 */

const ROW = {
  id: 1,
  label: 'InPost Paczkomat',
  resource_type: 'shipping_method',
  complete: false,
  translated_count: 0,
  applicable_count: 1,
  has_outdated: false,
  fields: [
    {
      key: 'name_pl',
      label_key: 'admin.translations.fields.name',
      source: 'Parcel locker',
      translation: null,
      multiline: false,
      max_len: 100,
      needs_translation: true,
      translated: false,
      outdated: false,
    },
  ],
}

const asyncStatus = ref<'idle' | 'loading'>('idle')
const mutateAsync = vi.fn()

vi.mock('~/composables/queries/useTranslationQueries', () => ({
  TRANSLATION_LOCALES: ['pl'],
  useTranslationResourceTypesQuery: () => ({
    data: ref({
      types: [{ type: 'shipping_method', label_key: 'admin.translations.fields.name', resource_count: 1, complete_count: 0 }],
    }),
  }),
  useTranslationListQuery: () => ({
    data: ref({ items: [ROW] }),
    status: ref('success'),
    error: ref(null),
  }),
  useUpdateTranslation: () => ({ mutateAsync, asyncStatus }),
}))

mockNuxtImport('useRoute', () => () => ({ query: {} }))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

function saveButton(): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Save')
}

beforeEach(() => {
  asyncStatus.value = 'idle'
  mutateAsync.mockReset()
})

describe('admin/translations page', () => {
  it('disables the Save button while the update mutation is in flight', async () => {
    const Page = (await import('./index.vue')).default
    const wrapper = await mountSuspended(Page, {
      global: { stubs: { NuxtLayout: PassThroughStub, ClientOnly: PassThroughStub } },
    })

    const edit = wrapper.findAll('button').find(b => b.text() === 'Edit')
    expect(edit).toBeDefined()
    await edit!.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(saveButton()).toBeDefined()
    expect(saveButton()!.disabled).toBe(false)

    asyncStatus.value = 'loading'
    await new Promise(r => setTimeout(r, 0))
    expect(saveButton()!.disabled).toBe(true)

    wrapper.unmount()
  })
})
