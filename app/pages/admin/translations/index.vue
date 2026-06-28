<script setup lang="ts">
/**
 * Admin Translations workspace — a Shopify "Translate & Adapt"-style surface
 * over the per-locale `*_pl` columns (backed by `/api/v1/admin/translations`).
 *
 * Layout: a language picker (only Polish today; English is the source) + one
 * tab per translatable resource type, each tab labelled with its completeness
 * count. Inside a tab: a search box + "untranslated only" toggle, then a table
 * of resources showing how many fields are translated and a status badge.
 * Editing a row opens a modal with the English source (read-only) beside an
 * editable field per translatable column; saving PUTs the changed values.
 *
 * Type/status/search live in the URL via `useUrlFilters` so the view is
 * deep-linkable. Data goes through Pinia Colada (`useTranslationQueries`).
 */

import { computed, ref, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { TranslationResourceRow } from '#shared/types/api'
import {
  TRANSLATION_LOCALES,
  useTranslationListQuery,
  useTranslationResourceTypesQuery,
  useUpdateTranslation,
} from '~/composables/queries/useTranslationQueries'
import type { TranslationLocale } from '~/composables/queries/useTranslationQueries'

definePageMeta({ middleware: ['admin'], layout: 'admin' })

const { t } = useI18n()
const toast = useToast()
useHead({ title: () => t('admin.translations.title') })

// Locale picker — only PL is exposed today (EN is the source locale).
const selectedLocale = ref<TranslationLocale>('pl')
const localeItems = computed(() =>
  TRANSLATION_LOCALES.map(code => ({ label: t(`admin.translations.locales.${code}`), value: code })),
)

// URL-backed view state.
const filterSchema = z.object({
  type: z.string().optional(),
  status: z.enum(['all', 'missing']).optional(),
  q: z.string().optional(),
})
const defaults = {
  type: undefined as string | undefined,
  status: 'all' as 'all' | 'missing',
  q: undefined as string | undefined,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

// ---------------------------------------------------------------------------
// Resource-type tabs + completeness summary
// ---------------------------------------------------------------------------

const typesQuery = useTranslationResourceTypesQuery(selectedLocale)
const resourceTypes = computed(() => typesQuery.data.value?.types ?? [])

// Plain ref bound straight to `<UTabs v-model>` (the proven pattern — a
// computed setter that round-trips through the async URL push makes the tab
// snap back). Mirrored to/from `?type=` for deep-linking + back/forward.
const activeType = ref(filters.value.type ?? 'shipping_method')
watch(
  () => filters.value.type,
  (t) => {
    if (t && t !== activeType.value) activeType.value = t
  },
)
watch(activeType, (t) => {
  if (t !== filters.value.type) set({ type: t })
})
const tabItems = computed(() =>
  resourceTypes.value.map(rt => ({
    label: `${t(rt.label_key)} (${rt.complete_count}/${rt.resource_count})`,
    value: rt.type,
  })),
)

// ---------------------------------------------------------------------------
// Search + missing-only filter
// ---------------------------------------------------------------------------

const searchInput = ref(filters.value.q ?? '')
const debouncedSearch = refDebounced(searchInput, 300)
watch(debouncedSearch, value => set({ q: value || undefined }))

const missingOnly = computed({
  get: () => filters.value.status === 'missing',
  set: (value: boolean) => set({ status: value ? 'missing' : 'all' }),
})

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const listParams = computed(() => ({
  locale: selectedLocale.value,
  status: filters.value.status ?? ('all' as const),
  q: filters.value.q,
  pageSize: 100,
}))
const { data: listData, status: listStatus, error: listError } = useTranslationListQuery(
  activeType,
  listParams,
)
const rows = computed<TranslationResourceRow[]>(() => listData.value?.items ?? [])

watch(listError, (err) => {
  if (err) toast.add({ title: t('admin.translations.loadError'), color: 'error' })
})

const columns = computed<TableColumn<TranslationResourceRow>[]>(() => [
  { accessorKey: 'label', header: () => t('admin.translations.fields.name') },
  { id: 'completeness', header: () => t('admin.translations.title') },
  { id: 'status', header: '' },
  { id: 'actions', header: '' },
])

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const editing = ref<TranslationResourceRow | null>(null)
const draft = ref<Record<string, string>>({})

function openEdit(row: TranslationResourceRow) {
  editing.value = row
  const next: Record<string, string> = {}
  for (const field of row.fields) next[field.key] = field.translation ?? ''
  draft.value = next
}

const updateMutation = useUpdateTranslation()
const saving = computed(() => updateMutation.status.value === 'loading')

async function save() {
  if (!editing.value) return
  try {
    await updateMutation.mutateAsync({
      resourceType: activeType.value,
      id: editing.value.id,
      locale: selectedLocale.value,
      fields: { ...draft.value },
    })
    toast.add({ title: t('admin.translations.saved') })
    editing.value = null
  }
  catch {
    toast.add({ title: t('admin.translations.saveError'), color: 'error' })
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold">
            {{ t('admin.translations.title') }}
          </h1>
          <p class="mt-1 text-sm text-muted">
            {{ t('admin.translations.subtitle') }}
          </p>
        </div>
        <UFormField :label="t('admin.translations.localeLabel')">
          <USelect
            v-model="selectedLocale"
            :items="localeItems"
            class="w-40"
          />
        </UFormField>
      </header>

      <UTabs
        v-if="tabItems.length"
        v-model="activeType"
        :items="tabItems"
        :content="false"
        :ui="{ list: 'max-w-3xl' }"
      />

      <div
        v-else-if="typesQuery.status.value === 'pending'"
        class="py-12 text-center text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 animate-spin"
        />
      </div>

      <section
        v-if="tabItems.length"
        class="space-y-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UInput
            v-model="searchInput"
            icon="i-lucide-search"
            :placeholder="t('admin.translations.searchPlaceholder')"
            class="w-64"
          />
          <USwitch
            v-model="missingOnly"
            :label="t('admin.translations.missingOnly')"
          />
        </div>

        <UTable
          :data="rows"
          :columns="columns"
          :loading="listStatus === 'pending'"
          :empty="t('admin.translations.empty')"
        >
          <template #completeness-cell="{ row }">
            <span class="text-sm text-muted">
              {{ t('admin.translations.completeness', {
                translated: row.original.translated_count,
                total: row.original.applicable_count,
              }) }}
            </span>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="row.original.complete ? 'success' : 'warning'">
              {{ row.original.complete
                ? t('admin.translations.complete')
                : t('admin.translations.incomplete') }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                size="xs"
                variant="soft"
                icon="i-lucide-pencil"
                @click="openEdit(row.original)"
              >
                {{ t('admin.translations.edit') }}
              </UButton>
            </div>
          </template>
        </UTable>
      </section>

      <UModal
        :open="!!editing"
        @update:open="(v) => { if (!v) editing = null }"
      >
        <template #content>
          <UCard>
            <template #header>
              <h2 class="text-base font-semibold">
                {{ t('admin.translations.editTitle') }}
              </h2>
              <p
                v-if="editing"
                class="mt-0.5 text-sm text-muted"
              >
                {{ editing.label }}
              </p>
            </template>

            <div
              v-if="editing"
              class="space-y-5"
            >
              <div
                v-for="field in editing.fields"
                :key="field.key"
                class="space-y-1.5"
              >
                <p class="text-sm font-medium">
                  {{ t(field.label_key) }}
                </p>
                <p class="rounded-md bg-elevated/50 px-3 py-2 text-sm text-muted">
                  <span class="mr-1 text-xs uppercase tracking-wide text-dimmed">
                    {{ t('admin.translations.source') }}:
                  </span>
                  <span v-if="field.source">{{ field.source }}</span>
                  <span
                    v-else
                    class="italic"
                  >{{ t('admin.translations.noSource') }}</span>
                </p>
                <UTextarea
                  v-if="field.multiline"
                  v-model="draft[field.key]"
                  :rows="3"
                  :maxlength="field.max_len ?? undefined"
                  class="w-full"
                />
                <UInput
                  v-else
                  v-model="draft[field.key]"
                  :maxlength="field.max_len ?? undefined"
                  class="w-full"
                />
              </div>
            </div>

            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton
                  variant="ghost"
                  @click="editing = null"
                >
                  {{ t('actions.cancel') }}
                </UButton>
                <UButton
                  :loading="saving"
                  @click="save"
                >
                  {{ t('admin.translations.save') }}
                </UButton>
              </div>
            </template>
          </UCard>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>
