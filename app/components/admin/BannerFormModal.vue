<script setup lang="ts">
import { z } from 'zod'
import type {
  BannerCreate,
  BannerPlacement,
  BannerResponse,
  BannerUpdate,
} from '~/composables/queries/useBannerQueries'

/**
 * Create / edit a banner.
 *
 * `banner === null` ⇒ create (POST); a banner ⇒ edit (PATCH, full validated
 * body — the backend re-validates cross-field rules against the merged state).
 * Client-side validation mirrors the backend rules (title + image_url required,
 * ends_at > starts_at) and surfaces as a synthetic `ProblemDetails` through
 * `<AdminFormModal :error>` so it renders identically to a server 422.
 *
 * Datetimes round-trip through `<input type="datetime-local">` (local, no zone) —
 * `toLocalInput` strips the ISO zone for display, `toIso` re-attaches the browser
 * zone on submit.
 */

const props = defineProps<{
  open: boolean
  // null = create; a banner = edit.
  banner: BannerResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const createBanner = useCreateBanner()
const updateBanner = useUpdateBanner()

const PLACEMENTS: BannerPlacement[] = ['home_hero', 'promo_strip']

const state = reactive({
  title: '',
  subtitle: '',
  image_url: '',
  link_url: '',
  placement: 'home_hero' as BannerPlacement,
  sort_order: 0 as number | null,
  starts_at: '',
  ends_at: '',
  is_active: true,
})
const error = ref<unknown>(null)

const isEdit = computed(() => props.banner !== null)
const loading = computed(() => createBanner.isLoading.value || updateBanner.isLoading.value)

const placementOptions = computed(() =>
  PLACEMENTS.map(p => ({ label: t(`admin.banners.placement.${p}`), value: p })),
)

// `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in local time.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const schema = computed(() =>
  z.object({
    title: z.string().trim().min(1, t('admin.banners.errors.titleRequired')),
    subtitle: z.string(),
    image_url: z.string().trim().min(1, t('admin.banners.errors.imageUrlRequired')),
    link_url: z.string(),
    placement: z.enum(PLACEMENTS as [BannerPlacement, ...BannerPlacement[]]),
    sort_order: z.number().nullable(),
    starts_at: z.string(),
    ends_at: z.string(),
    is_active: z.boolean(),
  }).superRefine((val, ctx) => {
    const startsIso = toIso(val.starts_at)
    const endsIso = toIso(val.ends_at)
    if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
      ctx.addIssue({
        code: 'custom',
        message: t('admin.banners.errors.endsBeforeStarts'),
        path: ['ends_at'],
      })
    }
  }),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const b = props.banner
    state.title = b?.title ?? ''
    state.subtitle = b?.subtitle ?? ''
    state.image_url = b?.image_url ?? ''
    state.link_url = b?.link_url ?? ''
    state.placement = b?.placement ?? 'home_hero'
    state.sort_order = b?.sort_order ?? 0
    state.starts_at = toLocalInput(b?.starts_at)
    state.ends_at = toLocalInput(b?.ends_at)
    state.is_active = b?.is_active ?? true
  },
  // immediate so an already-open mount (and re-opens) prefill from the banner prop.
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

/** Assemble the create body from validated state (client validation runs in UForm). */
function buildCreateBody(): BannerCreate {
  return {
    title: state.title.trim(),
    subtitle: state.subtitle.trim() || null,
    image_url: state.image_url.trim(),
    link_url: state.link_url.trim() || null,
    placement: state.placement,
    sort_order: state.sort_order ?? 0,
    starts_at: toIso(state.starts_at),
    ends_at: toIso(state.ends_at),
    is_active: state.is_active,
  }
}

async function onSubmit() {
  error.value = null
  const body = buildCreateBody()
  try {
    if (props.banner) {
      // The whole validated body doubles as the PATCH payload — the backend
      // re-validates cross-field rules against the merged state regardless.
      const patch: BannerUpdate = { ...body }
      await updateBanner.mutateAsync({ id: props.banner.id, patch })
      toast.add({
        title: t('admin.banners.flashes.updated'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    else {
      await createBanner.mutateAsync(body)
      toast.add({
        title: t('admin.banners.flashes.created'),
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
    :title="isEdit ? t('admin.banners.form.editTitle') : t('admin.banners.form.createTitle')"
    :submit-label="t('admin.banners.form.save')"
    :cancel-label="t('admin.banners.form.cancel')"
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
          :label="t('admin.banners.form.title')"
          name="title"
          required
        >
          <UInput
            v-model="state.title"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.banners.form.subtitle')"
          name="subtitle"
        >
          <UTextarea
            v-model="state.subtitle"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.banners.form.imageUrl')"
          :help="t('admin.banners.form.imageUrlHint')"
          name="image_url"
          required
        >
          <UInput
            v-model="state.image_url"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.banners.form.linkUrl')"
          :help="t('admin.banners.form.linkUrlHint')"
          name="link_url"
        >
          <UInput
            v-model="state.link_url"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.banners.form.placement')"
            name="placement"
            required
          >
            <USelect
              v-model="state.placement"
              :items="placementOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.banners.form.sortOrder')"
            :help="t('admin.banners.form.sortOrderHint')"
            name="sort_order"
          >
            <UInputNumber
              v-model="state.sort_order"
              :min="0"
              :step="1"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.banners.form.startsAt')"
            name="starts_at"
          >
            <UInput
              v-model="state.starts_at"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.banners.form.endsAt')"
            :help="t('admin.banners.form.scheduleHint')"
            name="ends_at"
          >
            <UInput
              v-model="state.ends_at"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          :label="t('admin.banners.form.isActive')"
          name="is_active"
        >
          <USwitch v-model="state.is_active" />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
