<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type {
  CampaignAudience,
  CampaignCreate,
  CampaignResponse,
  CampaignStatus,
  CampaignUpdate,
} from '~/composables/queries/useCampaignQueries'
import { parseProblem } from '#shared/utils/problemDetails'

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

const AUDIENCES: CampaignAudience[] = ['all', 'customers', 'b2b']
const STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'sent']

const name = ref('')
const subject = ref('')
const audience = ref<CampaignAudience>('all')
const status = ref<CampaignStatus>('draft')
const body = ref('')
const scheduledAt = ref('')
const error = ref<ProblemDetails | null>(null)

const isEdit = computed(() => props.campaign !== null)
const loading = computed(() => createCampaign.isLoading.value || updateCampaign.isLoading.value)
const isScheduled = computed(() => status.value === 'scheduled')

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
    name.value = c?.name ?? ''
    subject.value = c?.subject ?? ''
    audience.value = c?.audience ?? 'all'
    status.value = c?.status ?? 'draft'
    body.value = c?.body ?? ''
    scheduledAt.value = toLocalInput(c?.scheduled_at)
  },
  // immediate so an already-open mount (and re-opens) prefill from the campaign prop.
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
function buildCreateBody(): CampaignCreate | null {
  const trimmedName = name.value.trim()
  if (!trimmedName) return fail('admin.campaigns.errors.nameRequired')

  const trimmedSubject = subject.value.trim()
  if (!trimmedSubject) return fail('admin.campaigns.errors.subjectRequired')

  const scheduledIso = toIso(scheduledAt.value)
  if (isScheduled.value && !scheduledIso) {
    return fail('admin.campaigns.errors.scheduledAtRequired')
  }

  const trimmedBody = body.value.trim()
  return {
    name: trimmedName,
    subject: trimmedSubject,
    audience: audience.value,
    status: status.value,
    body: trimmedBody || null,
    scheduled_at: scheduledIso,
  }
}

async function onSubmit() {
  error.value = null
  const built = buildCreateBody()
  if (built === null) return
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
    error.value = parseProblem(err)
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
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.campaigns.form.name')"
          :help="t('admin.campaigns.form.nameHint')"
          name="name"
        >
          <UInput
            v-model="name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.campaigns.form.subject')"
          :help="t('admin.campaigns.form.subjectHint')"
          name="subject"
        >
          <UInput
            v-model="subject"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.campaigns.form.audience')"
            name="audience"
          >
            <USelect
              v-model="audience"
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
              v-model="status"
              :items="statusOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          v-if="isScheduled"
          :label="t('admin.campaigns.form.scheduledAt')"
          :help="t('admin.campaigns.form.scheduledAtHint')"
          name="scheduled_at"
        >
          <UInput
            v-model="scheduledAt"
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
            v-model="body"
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
