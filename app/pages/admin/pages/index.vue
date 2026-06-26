<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type {
  PageListItem,
  PageLocale,
  PageStatus,
  PageType,
} from '~/composables/queries/usePageQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const localePath = useLocalePath()
useHead({ title: () => t('admin.cms.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'draft', 'published', 'scheduled']).optional(),
  type: z.enum(['all', 'home', 'standard', 'landing']).optional(),
  locale: z.enum(['all', 'en', 'pl']).optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})
const defaults = {
  status: 'all' as const,
  type: 'all' as const,
  locale: 'all' as const,
  page: 1,
  pageSize: 20,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')
const typeFilter = computed(() => filters.value.type ?? 'all')
const localeFilter = computed(() => filters.value.locale ?? 'all')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  status: statusFilter.value === 'all' ? undefined : (statusFilter.value as PageStatus),
  type: typeFilter.value === 'all' ? undefined : (typeFilter.value as PageType),
  locale: localeFilter.value === 'all' ? undefined : (localeFilter.value as PageLocale),
}))

const { data: pageData, error: listError } = usePagesQuery(queryParams)
const items = computed<PageListItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() =>
  statusFilter.value !== 'all' || typeFilter.value !== 'all' || localeFilter.value !== 'all',
)

const statusOptions = computed(() => [
  { label: t('admin.cms.filters.allStatuses'), value: 'all' },
  { label: t('admin.cms.status.draft'), value: 'draft' },
  { label: t('admin.cms.status.published'), value: 'published' },
  { label: t('admin.cms.status.scheduled'), value: 'scheduled' },
])
const typeOptions = computed(() => [
  { label: t('admin.cms.filters.allTypes'), value: 'all' },
  { label: t('admin.cms.pageType.home'), value: 'home' },
  { label: t('admin.cms.pageType.standard'), value: 'standard' },
  { label: t('admin.cms.pageType.landing'), value: 'landing' },
])
const localeOptions = computed(() => [
  { label: t('admin.cms.filters.allLocales'), value: 'all' },
  { label: 'EN', value: 'en' },
  { label: 'PL', value: 'pl' },
])

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function statusColor(status: PageStatus) {
  if (status === 'published') return 'success' as const
  if (status === 'scheduled') return 'warning' as const
  return 'neutral' as const
}

const columns: TableColumn<PageListItem>[] = [
  { accessorKey: 'slug', header: () => t('admin.cms.fields.slug') },
  { accessorKey: 'type', header: () => t('admin.cms.fields.type') },
  { accessorKey: 'locale', header: () => t('admin.cms.fields.locale') },
  { accessorKey: 'status', header: () => t('admin.cms.fields.status') },
  { accessorKey: 'updated_at', header: () => t('admin.cms.fields.updatedAt') },
  { id: 'actions', header: '' },
]

// Create modal.
const createOpen = ref(false)
const createState = reactive({
  slug: '',
  type: 'standard' as PageType,
  locale: 'en' as PageLocale,
})
const createError = ref<unknown>(null)
const createPage = useCreatePage()

const createSchema = computed(() =>
  z.object({
    slug: z.string().trim().min(1, t('admin.cms.errors.slugRequired')),
    type: z.enum(['home', 'standard', 'landing']),
    locale: z.enum(['en', 'pl']),
  }),
)

const createTypeOptions = computed(() => [
  { label: t('admin.cms.pageType.home'), value: 'home' },
  { label: t('admin.cms.pageType.standard'), value: 'standard' },
  { label: t('admin.cms.pageType.landing'), value: 'landing' },
])
const createLocaleOptions = [
  { label: 'EN', value: 'en' as const },
  { label: 'PL', value: 'pl' as const },
]

function openCreate() {
  createState.slug = ''
  createState.type = 'standard'
  createState.locale = 'en'
  createError.value = null
  createOpen.value = true
}

async function confirmCreate() {
  createError.value = null
  try {
    const created = await createPage.mutateAsync({
      slug: createState.slug.trim(),
      type: createState.type,
      locale: createState.locale,
    })
    createOpen.value = false
    await navigateTo(localePath(`/admin/pages/${created.id}`))
  }
  catch (err) {
    createError.value = err
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.cms.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.cms.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="openCreate"
        >
          {{ $t('admin.cms.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.cms.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-44"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.cms.filters.type')">
          <USelect
            :model-value="typeFilter"
            :items="typeOptions"
            value-key="value"
            class="w-44"
            @update:model-value="(v) => set({ type: v as typeof defaults.type, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.cms.filters.locale')">
          <USelect
            :model-value="localeFilter"
            :items="localeOptions"
            value-key="value"
            class="w-32"
            @update:model-value="(v) => set({ locale: v as typeof defaults.locale, page: 1 })"
          />
        </UFormField>
      </div>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <div
        v-if="items.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        <template v-if="hasFilter">
          {{ $t('admin.cms.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.cms.empty.noPages') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #slug-cell="{ row }">
          <NuxtLink
            :to="localePath(`/admin/pages/${row.original.id}`)"
            class="font-medium hover:text-primary"
          >
            /{{ row.original.slug }}
          </NuxtLink>
          <p
            v-if="row.original.seo_title"
            class="text-muted text-xs mt-0.5 max-w-xs truncate"
          >
            {{ row.original.seo_title }}
          </p>
        </template>
        <template #type-cell="{ row }">
          <UBadge
            color="neutral"
            variant="subtle"
          >
            {{ $t(`admin.cms.pageType.${row.original.type}`) }}
          </UBadge>
        </template>
        <template #locale-cell="{ row }">
          <span class="uppercase text-sm">{{ row.original.locale }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="statusColor(row.original.status)"
            variant="subtle"
          >
            {{ $t(`admin.cms.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #updated_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.updated_at) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :to="localePath(`/admin/pages/${row.original.id}`)"
              :aria-label="$t('admin.cms.actions.edit')"
            />
          </div>
        </template>
      </UTable>

      <UPagination
        v-if="total > queryParams.pageSize"
        :total="total"
        :items-per-page="queryParams.pageSize"
        :page="queryParams.page"
        class="mt-4"
        @update:page="(p) => set({ page: p })"
      />

      <AdminFormModal
        :open="createOpen"
        :title="t('admin.cms.create.title')"
        :submit-label="t('admin.cms.create.submit')"
        :cancel-label="t('admin.cms.form.cancel')"
        :loading="createPage.isLoading.value"
        :error="createError"
        :schema="createSchema"
        :state="createState"
        @update:open="(v) => (createOpen = v)"
        @submit="confirmCreate"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField
              :label="t('admin.cms.fields.slug')"
              :help="t('admin.cms.create.slugHint')"
              name="slug"
              required
            >
              <UInput
                v-model="createState.slug"
                placeholder="about-us"
                class="w-full"
              />
            </UFormField>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField
                :label="t('admin.cms.fields.type')"
                name="type"
              >
                <USelect
                  v-model="createState.type"
                  :items="createTypeOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="t('admin.cms.fields.locale')"
                name="locale"
              >
                <USelect
                  v-model="createState.locale"
                  :items="createLocaleOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </template>
      </AdminFormModal>
    </div>
  </NuxtLayout>
</template>
