<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type {
  CampaignAudience,
  CampaignResponse,
  CampaignStatus,
} from '~/composables/queries/useCampaignQueries'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.campaigns.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'draft', 'scheduled', 'sent']).optional(),
  audience: z.enum(['all', 'customers', 'b2b']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  pageSize: z.coerce.number().min(1).max(100).optional(),
})
const defaults = {
  status: 'all' as const,
  audience: 'all' as const,
  search: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')
const audienceFilter = computed(() => filters.value.audience ?? 'all')
const searchValue = computed(() => filters.value.search ?? '')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  status:
    statusFilter.value === 'all'
      ? undefined
      : (statusFilter.value as CampaignStatus),
  audience:
    audienceFilter.value === 'all'
      ? undefined
      : (audienceFilter.value as CampaignAudience),
  search: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useCampaignsQuery(queryParams)
const items = computed<CampaignResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() =>
  statusFilter.value !== 'all'
  || audienceFilter.value !== 'all'
  || searchValue.value.length > 0,
)

const statusOptions = computed(() => [
  { label: t('admin.campaigns.filters.all'), value: 'all' },
  { label: t('admin.campaigns.status.draft'), value: 'draft' },
  { label: t('admin.campaigns.status.scheduled'), value: 'scheduled' },
  { label: t('admin.campaigns.status.sent'), value: 'sent' },
])
const audienceOptions = computed(() => [
  { label: t('admin.campaigns.filters.all'), value: 'all' },
  { label: t('admin.campaigns.audience.customers'), value: 'customers' },
  { label: t('admin.campaigns.audience.b2b'), value: 'b2b' },
])

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

const statusColor: Record<CampaignStatus, 'neutral' | 'warning' | 'success'> = {
  draft: 'neutral',
  scheduled: 'warning',
  sent: 'success',
}

const columns: TableColumn<CampaignResponse>[] = [
  { accessorKey: 'name', header: () => t('admin.campaigns.fields.name') },
  { accessorKey: 'audience', header: () => t('admin.campaigns.fields.audience') },
  { accessorKey: 'status', header: () => t('admin.campaigns.fields.status') },
  { accessorKey: 'scheduled_at', header: () => t('admin.campaigns.fields.scheduledAt') },
  { accessorKey: 'sent_at', header: () => t('admin.campaigns.fields.sentAt') },
  { id: 'actions', header: '' },
]

const toast = useToast()

// Create / edit modal.
const formOpen = ref(false)
const editing = ref<CampaignResponse | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit(campaign: CampaignResponse) {
  editing.value = campaign
  formOpen.value = true
}

// Send confirmation (outward-facing — dispatches real email).
const sendOpen = ref(false)
const sendTarget = ref<CampaignResponse | null>(null)
const sendError = ref<ProblemDetails | null>(null)
const sendCampaign = useSendCampaign()

function openSend(campaign: CampaignResponse) {
  sendTarget.value = campaign
  sendError.value = null
  sendOpen.value = true
}

async function confirmSend(id: number) {
  sendError.value = null
  try {
    await sendCampaign.mutateAsync(id)
    toast.add({
      title: t('admin.campaigns.flashes.sent'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    sendOpen.value = false
  }
  catch (err) {
    sendError.value = parseProblem(err)
  }
}

// Delete confirmation.
const deleteOpen = ref(false)
const deleteTarget = ref<CampaignResponse | null>(null)
const deleteError = ref<ProblemDetails | null>(null)
const deleteCampaign = useDeleteCampaign()

function openDelete(campaign: CampaignResponse) {
  deleteTarget.value = campaign
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete(id: number) {
  deleteError.value = null
  try {
    await deleteCampaign.mutateAsync(id)
    toast.add({
      title: t('admin.campaigns.flashes.deleted'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    deleteOpen.value = false
  }
  catch (err) {
    deleteError.value = parseProblem(err)
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.campaigns.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.campaigns.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="openCreate"
        >
          {{ $t('admin.campaigns.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.campaigns.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.campaigns.filters.audience')">
          <USelect
            :model-value="audienceFilter"
            :items="audienceOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ audience: v as typeof defaults.audience, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.campaigns.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.campaigns.filters.searchPlaceholder')"
            icon="i-lucide-search"
            class="w-60"
            @update:model-value="(v) => set({ search: (v as string) || undefined, page: 1 })"
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
          {{ $t('admin.campaigns.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.campaigns.empty.noCampaigns') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #name-cell="{ row }">
          <span class="font-medium">{{ row.original.name }}</span>
          <p class="text-muted text-xs mt-0.5 max-w-xs truncate">
            {{ row.original.subject }}
          </p>
        </template>
        <template #audience-cell="{ row }">
          <UBadge
            color="neutral"
            variant="subtle"
          >
            {{ $t(`admin.campaigns.audience.${row.original.audience}`) }}
          </UBadge>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="statusColor[row.original.status]"
            variant="subtle"
          >
            {{ $t(`admin.campaigns.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #scheduled_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.scheduled_at) }}</span>
        </template>
        <template #sent_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.sent_at) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end items-center gap-1">
            <UButton
              v-if="row.original.status !== 'sent'"
              color="primary"
              variant="soft"
              icon="i-lucide-send"
              size="sm"
              @click="openSend(row.original)"
            >
              {{ $t('admin.campaigns.actions.send') }}
            </UButton>
            <UBadge
              v-else
              color="success"
              variant="subtle"
              icon="i-lucide-check"
            >
              {{ $t('admin.campaigns.status.sent') }}
            </UBadge>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.campaigns.actions.edit')"
              @click="openEdit(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :aria-label="$t('admin.campaigns.actions.delete')"
              @click="openDelete(row.original)"
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

      <AdminCampaignFormModal
        :open="formOpen"
        :campaign="editing"
        @update:open="(v) => (formOpen = v)"
      />

      <AdminCampaignSendConfirm
        :open="sendOpen"
        :campaign="sendTarget"
        :loading="sendCampaign.isLoading.value"
        :error="sendError"
        @update:open="(v) => (sendOpen = v)"
        @confirm="confirmSend"
      />

      <AdminCampaignDeleteConfirm
        :open="deleteOpen"
        :campaign="deleteTarget"
        :loading="deleteCampaign.isLoading.value"
        :error="deleteError"
        @update:open="(v) => (deleteOpen = v)"
        @confirm="confirmDelete"
      />
    </div>
  </NuxtLayout>
</template>
