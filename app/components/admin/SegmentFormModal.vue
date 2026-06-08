<script setup lang="ts">
import { z } from 'zod'
import { watchDebounced } from '@vueuse/core'
import type {
  SegmentCreate,
  SegmentFilters,
  SegmentPreview,
  SegmentResponse,
  SegmentUpdate,
} from '~/composables/queries/useSegmentQueries'
import type { TagResponse } from '#shared/types/api'

/**
 * Create / edit a customer segment.
 *
 * `segment === null` ⇒ create (POST); a segment ⇒ edit (PATCH, full body).
 *
 * The filter builder is a STRUCTURED form (not free text): every control maps to
 * one optional `SegmentFilters` key. `buildFilters()` omits empty keys and never
 * emits unknown keys (the backend is `extra="forbid"`). The currency-required
 * rule (currency mandatory when `min_total_spent` is set) is mirrored client-side
 * in the Zod schema so it surfaces as a synthetic 422 identical to the server.
 *
 * A live "Matches N customers" panel debounce-calls
 * `POST /api/v1/admin/segments/preview` with the current filter body on every
 * change and shows a small sample list.
 */

const props = defineProps<{
  open: boolean
  // null = create; a segment = edit.
  segment: SegmentResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const createSegment = useCreateSegment()
const updateSegment = useUpdateSegment()
const { previewFilters } = useSegmentPreview()

const { apiFetch } = useApi()
const tagOptions = ref<TagResponse[]>([])

const CURRENCIES = ['USD', 'PLN', 'EUR'] as const
type Currency = (typeof CURRENCIES)[number]
const TAG_MATCHES = ['any', 'all'] as const
type TagMatch = (typeof TAG_MATCHES)[number]
const ROLES = ['customer', 'b2b'] as const
type Role = (typeof ROLES)[number]

interface FilterState {
  name: string
  description: string
  is_active: boolean
  tag_ids: number[]
  tag_match: TagMatch
  min_order_count: number | null
  max_order_count: number | null
  min_total_spent: number | null
  currency: Currency | null
  last_order_after: string
  last_order_before: string
  country: string
  role: Role | 'any'
}

// Declare state BEFORE useValidatedForm-adjacent helpers (TDZ rule).
const state = reactive<FilterState>({
  name: '',
  description: '',
  is_active: true,
  tag_ids: [],
  tag_match: 'any',
  min_order_count: null,
  max_order_count: null,
  min_total_spent: null,
  currency: null,
  last_order_after: '',
  last_order_before: '',
  country: '',
  role: 'any',
})
const error = ref<unknown>(null)

const isEdit = computed(() => props.segment !== null)
const loading = computed(() => createSegment.isLoading.value || updateSegment.isLoading.value)

const currencyOptions = computed(() =>
  CURRENCIES.map(c => ({ label: c, value: c })),
)
const tagMatchOptions = computed(() =>
  TAG_MATCHES.map(m => ({ label: t(`admin.segments.tagMatch.${m}`), value: m })),
)
const roleOptions = computed(() => [
  { label: t('admin.segments.role.any'), value: 'any' },
  ...ROLES.map(r => ({ label: t(`admin.segments.role.${r}`), value: r })),
])
const tagSelectItems = computed(() =>
  tagOptions.value.map(tag => ({ label: tag.name, value: tag.id })),
)

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('admin.segments.errors.nameRequired')),
    description: z.string(),
    is_active: z.boolean(),
    tag_ids: z.array(z.number()),
    tag_match: z.enum(TAG_MATCHES),
    min_order_count: z.number().nullable(),
    max_order_count: z.number().nullable(),
    min_total_spent: z.number().nullable(),
    currency: z.enum(CURRENCIES).nullable(),
    last_order_after: z.string(),
    last_order_before: z.string(),
    country: z.string(),
    role: z.string(),
  }).superRefine((val, ctx) => {
    // Mirror the backend: currency is required when a spend floor is set.
    if (val.min_total_spent != null && !val.currency) {
      ctx.addIssue({
        code: 'custom',
        message: t('admin.segments.errors.currencyRequired'),
        path: ['currency'],
      })
    }
  }),
)

/** Assemble the typed `SegmentFilters` body — omit empty keys, never unknown keys. */
function buildFilters(): SegmentFilters {
  const filters: SegmentFilters = { tag_match: state.tag_match }
  if (state.tag_ids.length > 0) filters.tag_ids = [...state.tag_ids]
  if (state.min_order_count != null) filters.min_order_count = state.min_order_count
  if (state.max_order_count != null) filters.max_order_count = state.max_order_count
  if (state.min_total_spent != null) {
    filters.min_total_spent = state.min_total_spent
    if (state.currency) filters.currency = state.currency
  }
  if (state.last_order_after) filters.last_order_after = state.last_order_after
  if (state.last_order_before) filters.last_order_before = state.last_order_before
  if (state.country.trim()) filters.country = state.country.trim()
  if (state.role !== 'any') filters.role = state.role
  return filters
}

// --- Live "Matches N customers" preview ----------------------------------
const preview = ref<SegmentPreview | null>(null)
const previewLoading = ref(false)
const previewError = ref(false)
const previewCount = computed(() => preview.value?.count ?? 0)

async function runPreview() {
  // Skip the preview when the spend floor is set without a currency — the
  // backend would 422 (and the form blocks save on it anyway).
  if (state.min_total_spent != null && !state.currency) {
    preview.value = null
    return
  }
  previewLoading.value = true
  previewError.value = false
  try {
    preview.value = await previewFilters(buildFilters(), 5)
  }
  catch {
    previewError.value = true
    preview.value = null
  }
  finally {
    previewLoading.value = false
  }
}

watchDebounced(
  () => JSON.stringify(buildFilters()),
  () => {
    if (props.open) void runPreview()
  },
  { debounce: 400 },
)

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    error.value = null
    preview.value = null
    previewError.value = false
    const s = props.segment
    const f = s?.filters
    state.name = s?.name ?? ''
    state.description = s?.description ?? ''
    state.is_active = s?.is_active ?? true
    state.tag_ids = f?.tag_ids ? [...f.tag_ids] : []
    state.tag_match = f?.tag_match ?? 'any'
    state.min_order_count = f?.min_order_count ?? null
    state.max_order_count = f?.max_order_count ?? null
    state.min_total_spent = f?.min_total_spent ?? null
    state.currency = f?.currency ?? null
    state.last_order_after = f?.last_order_after ?? ''
    state.last_order_before = f?.last_order_before ?? ''
    state.country = f?.country ?? ''
    state.role = f?.role ?? 'any'

    // Load the tag vocabulary lazily (client-only) for the multiselect.
    if (import.meta.client && tagOptions.value.length === 0) {
      try {
        tagOptions.value = await apiFetch<TagResponse[]>('/api/v1/admin/tags/')
      }
      catch {
        tagOptions.value = []
      }
    }
    void runPreview()
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  error.value = null
  const body: SegmentCreate = {
    name: state.name.trim(),
    description: state.description.trim() || null,
    is_active: state.is_active,
    filters: buildFilters(),
  }
  try {
    if (props.segment) {
      const patch: SegmentUpdate = { ...body }
      await updateSegment.mutateAsync({ id: props.segment.id, patch })
      toast.add({
        title: t('admin.segments.flashes.updated'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    else {
      await createSegment.mutateAsync(body)
      toast.add({
        title: t('admin.segments.flashes.created'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    emit('saved')
    openModel.value = false
  }
  catch (err) {
    error.value = err
  }
}
</script>

<template>
  <AdminFormModal
    :open="openModel"
    :title="isEdit ? t('admin.segments.form.editTitle') : t('admin.segments.form.createTitle')"
    :submit-label="t('admin.segments.form.save')"
    :cancel-label="t('admin.segments.form.cancel')"
    :loading="loading"
    :error="error"
    :schema="schema"
    :state="state"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.segments.form.name')"
          :help="t('admin.segments.form.nameHint')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.segments.form.description')"
          name="description"
        >
          <UTextarea
            v-model="state.description"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <UFormField name="is_active">
          <UCheckbox
            v-model="state.is_active"
            :label="t('admin.segments.form.isActive')"
          />
        </UFormField>

        <p class="text-sm font-semibold text-highlighted pt-2">
          {{ t('admin.segments.form.filtersHeading') }}
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <UFormField
            :label="t('admin.segments.form.tags')"
            name="tag_ids"
            class="sm:col-span-2"
          >
            <USelectMenu
              v-model="state.tag_ids"
              :items="tagSelectItems"
              value-key="value"
              multiple
              :placeholder="t('admin.segments.form.tagsPlaceholder')"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.segments.form.tagMatch')"
            name="tag_match"
          >
            <USelect
              v-model="state.tag_match"
              :items="tagMatchOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.segments.form.minOrderCount')"
            name="min_order_count"
          >
            <UInputNumber
              v-model="state.min_order_count"
              :min="0"
              :step="1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.segments.form.maxOrderCount')"
            name="max_order_count"
          >
            <UInputNumber
              v-model="state.max_order_count"
              :min="0"
              :step="1"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.segments.form.minTotalSpent')"
            :help="t('admin.segments.form.minTotalSpentHint')"
            name="min_total_spent"
          >
            <UInputNumber
              v-model="state.min_total_spent"
              :min="0"
              :step="0.01"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.segments.form.currency')"
            name="currency"
            :required="state.min_total_spent != null"
          >
            <USelect
              v-model="state.currency"
              :items="currencyOptions"
              value-key="value"
              :placeholder="t('admin.segments.form.currencyPlaceholder')"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.segments.form.lastOrderAfter')"
            name="last_order_after"
          >
            <UInput
              v-model="state.last_order_after"
              type="date"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.segments.form.lastOrderBefore')"
            name="last_order_before"
          >
            <UInput
              v-model="state.last_order_before"
              type="date"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.segments.form.country')"
            :help="t('admin.segments.form.countryHint')"
            name="country"
          >
            <UInput
              v-model="state.country"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.segments.form.role')"
            name="role"
          >
            <USelect
              v-model="state.role"
              :items="roleOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Live "Matches N customers" panel -->
        <div class="rounded-lg border border-default bg-elevated/50 p-3 mt-2">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-users"
              class="text-muted"
            />
            <span
              v-if="previewLoading"
              class="text-sm text-muted"
            >
              {{ t('admin.segments.preview.loading') }}
            </span>
            <span
              v-else-if="previewError"
              class="text-sm text-error"
            >
              {{ t('admin.segments.preview.error') }}
            </span>
            <span
              v-else
              class="text-sm font-medium"
            >
              {{ t('admin.segments.preview.matches', { count: previewCount }, previewCount) }}
            </span>
          </div>
          <ul
            v-if="preview && preview.sample.length > 0"
            class="mt-2 space-y-0.5"
          >
            <li
              v-for="c in preview.sample"
              :key="c.id"
              class="text-xs text-muted truncate"
            >
              {{ c.first_name }} {{ c.last_name }} · {{ c.email }}
            </li>
          </ul>
        </div>
      </div>
    </template>
  </AdminFormModal>
</template>
