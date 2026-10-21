<script setup lang="ts">
import { z } from 'zod'
import type {
  CampaignAudience,
  CampaignCreate,
  CampaignResponse,
  CampaignStatus,
  CampaignUpdate,
} from '~/composables/queries/useCampaignQueries'

/**
 * Create / edit an email campaign.
 *
 * `campaign === null` ⇒ create (POST); a campaign ⇒ edit (PATCH, full body).
 * Client-side validation mirrors the backend rule (`scheduled_at` required when
 * `status === 'scheduled'`) and surfaces as a synthetic `ProblemDetails`
 * through `<AdminFormModal :error>`, so it renders identically to a server 422.
 * The same server 422 falls through to the same alert.
 *
 * `sent_at` is managed by the send layer — shown read-only when present, never
 * edited here.
 *
 * `scheduled_at` round-trips through `<input type="datetime-local">` (local, no
 * zone) — `toLocalInput` strips the ISO zone for display, `toIso` re-attaches
 * the browser zone on submit.
 */

const props = defineProps<{
  open: boolean
  // null = create; a campaign = edit.
  campaign: CampaignResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const createCampaign = useCreateCampaign()
const updateCampaign = useUpdateCampaign()

const AUDIENCES: CampaignAudience[] = ['all', 'customers', 'b2b', 'segment']
const STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'sent']

const state = reactive({
  name: '',
  subject: '',
  audience: 'all' as CampaignAudience,
  status: 'draft' as CampaignStatus,
  body: '',
  scheduled_at: '',
  segment_id: null as number | null,
})
const error = ref<unknown>(null)

const isEdit = computed(() => props.campaign !== null)
const loading = computed(() => createCampaign.isLoading.value || updateCampaign.isLoading.value)
const isScheduled = computed(() => state.status === 'scheduled')
const isSegment = computed(() => state.audience === 'segment')

// Segment audience picker: load active segments + resolve the recipient count
// of the picked segment.
const { data: segmentsPage } = useSegmentsQuery({ isActive: true, pageSize: 100 })
const { previewSaved } = useSegmentPreview()
const segmentOptions = computed(() =>
  (segmentsPage.value?.items ?? []).map(s => ({ label: s.name, value: s.id })),
)
const segmentCount = ref<number | null>(null)
const segmentCountLoading = ref(false)

watch(
  () => [state.audience, state.segment_id] as const,
  async ([audience, id]) => {
    if (audience !== 'segment' || id == null) {
      segmentCount.value = null
      return
    }
    segmentCountLoading.value = true
    try {
      const preview = await previewSaved(id, 0)
      segmentCount.value = preview.count
    }
    catch {
      segmentCount.value = null
    }
    finally {
      segmentCountLoading.value = false
    }
  },
)

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('admin.campaigns.errors.nameRequired')),
    subject: z.string().trim().min(1, t('admin.campaigns.errors.subjectRequired')),
    audience: z.enum(AUDIENCES as [CampaignAudience, ...CampaignAudience[]]),
    status: z.enum(STATUSES as [CampaignStatus, ...CampaignStatus[]]),
    body: z.string(),
    scheduled_at: z.string(),
    segment_id: z.number().nullable(),
  }).superRefine((val, ctx) => {
    if (val.status === 'scheduled' && !toIso(val.scheduled_at)) {
      ctx.addIssue({
        code: 'custom',
        message: t('admin.campaigns.errors.scheduledAtRequired'),
        path: ['scheduled_at'],
      })
    }
    // Mirror the backend: a `segment` audience requires a segment_id.
    if (val.audience === 'segment' && val.segment_id == null) {
      ctx.addIssue({
        code: 'custom',
        message: t('admin.campaigns.errors.segmentRequired'),
        path: ['segment_id'],
      })
    }
  }),
)

const audienceOptions = computed(() =>
  AUDIENCES.map(a => ({ label: t(`admin.campaigns.audience.${a}`), value: a })),
)
const statusOptions = computed(() =>
  STATUSES.map(s => ({ label: t(`admin.campaigns.status.${s}`), value: s })),
)

const dateTimeFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
const sentAtDisplay = computed(() => {
  const iso = props.campaign?.sent_at
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : dateTimeFmt.format(d)
})

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
    const c = props.campaign
    state.name = c?.name ?? ''
    state.subject = c?.subject ?? ''
    state.audience = c?.audience ?? 'all'
    state.status = c?.status ?? 'draft'
    state.body = c?.body ?? ''
    state.scheduled_at = toLocalInput(c?.scheduled_at)
    state.segment_id = c?.segment_id ?? null
  },
  // immediate so an already-open mount (and re-opens) prefill from the campaign prop.
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

/** Assemble the create body from validated state (client validation runs in UForm). */
function buildCreateBody(): CampaignCreate {
  return {
    name: state.name.trim(),
    subject: state.subject.trim(),
    audience: state.audience,
    status: state.status,
    body: state.body.trim() || null,
    scheduled_at: toIso(state.scheduled_at),
    // The backend 422s a segment_id on a non-segment audience — send it only
    // when the audience is `segment`, else explicit null.
    segment_id: state.audience === 'segment' ? state.segment_id : null,
  }
}

async function onSubmit() {
  error.value = null
  const built = buildCreateBody()
  try {
    if (props.campaign) {
      // The whole validated body doubles as the PATCH payload — the backend
      // re-validates the schedule rule against the merged state regardless.
      const patch: CampaignUpdate = { ...built }
      await updateCampaign.mutateAsync({ id: props.campaign.id, patch })
      toast.add({
        title: t('admin.campaigns.flashes.updated'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    else {
      await createCampaign.mutateAsync(built)
      toast.add({
        title: t('admin.campaigns.flashes.created'),
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
    :title="isEdit ? t('admin.campaigns.form.editTitle') : t('admin.campaigns.form.createTitle')"
    :submit-label="t('admin.campaigns.form.save')"
    :cancel-label="t('admin.campaigns.form.cancel')"
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
          :label="t('admin.campaigns.form.name')"
          :help="t('admin.campaigns.form.nameHint')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.campaigns.form.subject')"
          :help="t('admin.campaigns.form.subjectHint')"
          name="subject"
          required
        >
          <UInput
            v-model="state.subject"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.campaigns.form.audience')"
            name="audience"
          >
            <USelect
              v-model="state.audience"
              :items="audienceOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.campaigns.form.status')"
            name="status"
          >
            <USelect
              v-model="state.status"
              :items="statusOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          v-if="isSegment"
          :label="t('admin.campaigns.form.segment')"
          :help="t('admin.campaigns.form.segmentHint')"
          name="segment_id"
          required
        >
          <USelect
            v-model.nullable="state.segment_id"
            :items="segmentOptions"
            value-key="value"
            :placeholder="t('admin.campaigns.form.segmentPlaceholder')"
            class="w-full"
          />
          <p
            v-if="state.segment_id != null"
            class="text-xs text-muted mt-1"
          >
            <template v-if="segmentCountLoading">
              {{ t('admin.campaigns.form.segmentCountLoading') }}
            </template>
            <template v-else-if="segmentCount != null">
              {{ t('admin.campaigns.form.segmentCount', { count: segmentCount }, segmentCount) }}
            </template>
          </p>
        </UFormField>

        <UFormField
          v-if="isScheduled"
          :label="t('admin.campaigns.form.scheduledAt')"
          :help="t('admin.campaigns.form.scheduledAtHint')"
          name="scheduled_at"
        >
          <UInput
            v-model="state.scheduled_at"
            type="datetime-local"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.campaigns.form.body')"
          :help="t('admin.campaigns.form.bodyHint')"
          name="body"
        >
          <UTextarea
            v-model="state.body"
            :rows="6"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="sentAtDisplay"
          :label="t('admin.campaigns.form.sentAt')"
          name="sent_at"
        >
          <p class="text-sm text-muted">
            {{ sentAtDisplay }}
          </p>
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
