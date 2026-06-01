<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type {
  BannerCreate,
  BannerPlacement,
  BannerResponse,
  BannerUpdate,
} from '~/composables/queries/useBannerQueries'
import { parseProblem } from '#shared/utils/problemDetails'

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

const title = ref('')
const subtitle = ref('')
const imageUrl = ref('')
const linkUrl = ref('')
const placement = ref<BannerPlacement>('home_hero')
const sortOrder = ref<number | null>(0)
const startsAt = ref('')
const endsAt = ref('')
const isActive = ref(true)
const error = ref<ProblemDetails | null>(null)

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

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const b = props.banner
    title.value = b?.title ?? ''
    subtitle.value = b?.subtitle ?? ''
    imageUrl.value = b?.image_url ?? ''
    linkUrl.value = b?.link_url ?? ''
    placement.value = b?.placement ?? 'home_hero'
    sortOrder.value = b?.sort_order ?? 0
    startsAt.value = toLocalInput(b?.starts_at)
    endsAt.value = toLocalInput(b?.ends_at)
    isActive.value = b?.is_active ?? true
  },
  // immediate so an already-open mount (and re-opens) prefill from the banner prop.
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function fail(messageKey: string): null {
  error.value = { title: t(messageKey) }
  return null
}

/** Validate + assemble the create body. Returns null (and sets `error`) on failure. */
function buildCreateBody(): BannerCreate | null {
  const trimmedTitle = title.value.trim()
  if (!trimmedTitle) return fail('admin.banners.errors.titleRequired')

  const trimmedImageUrl = imageUrl.value.trim()
  if (!trimmedImageUrl) return fail('admin.banners.errors.imageUrlRequired')

  if (!PLACEMENTS.includes(placement.value)) {
    return fail('admin.banners.errors.placementRequired')
  }

  const startsIso = toIso(startsAt.value)
  const endsIso = toIso(endsAt.value)
  if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
    return fail('admin.banners.errors.endsBeforeStarts')
  }

  const trimmedSubtitle = subtitle.value.trim()
  const trimmedLinkUrl = linkUrl.value.trim()
  return {
    title: trimmedTitle,
    subtitle: trimmedSubtitle || null,
    image_url: trimmedImageUrl,
    link_url: trimmedLinkUrl || null,
    placement: placement.value,
    sort_order: sortOrder.value ?? 0,
    starts_at: startsIso,
    ends_at: endsIso,
    is_active: isActive.value,
  }
}

async function onSubmit() {
  error.value = null
  const body = buildCreateBody()
  if (body === null) return
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
    error.value = parseProblem(err)
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
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.banners.form.title')"
          name="title"
        >
          <UInput
            v-model="title"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.banners.form.subtitle')"
          name="subtitle"
        >
          <UTextarea
            v-model="subtitle"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.banners.form.imageUrl')"
          :help="t('admin.banners.form.imageUrlHint')"
          name="image_url"
        >
          <UInput
            v-model="imageUrl"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.banners.form.linkUrl')"
          :help="t('admin.banners.form.linkUrlHint')"
          name="link_url"
        >
          <UInput
            v-model="linkUrl"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.banners.form.placement')"
            name="placement"
          >
            <USelect
              v-model="placement"
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
              v-model="sortOrder"
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
              v-model="startsAt"
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
              v-model="endsAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          :label="t('admin.banners.form.isActive')"
          name="is_active"
        >
          <USwitch v-model="isActive" />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
