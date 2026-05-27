<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { AuditEventItem } from '#shared/types/api'
import type { AuditAction, AuditResourceType } from '~/composables/queries/useAuditEventQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.auditLog.title') })

const filterSchema = z.object({
  resourceType: z
    .enum([
      'all',
      'product',
      'product_image',
      'category',
      'order',
      'customer',
      'customer_note',
      'customer_tag',
      'tag',
      'inventory',
      'review',
    ])
    .optional(),
  action: z.enum(['all', 'create', 'update', 'delete']).optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  resourceType: 'all' as const,
  action: 'all' as const,
  page: 1,
  pageSize: 20,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const resourceFilter = computed(() => filters.value.resourceType ?? 'all')
const actionFilter = computed(() => filters.value.action ?? 'all')

function onResourceTypeChange(v: unknown) {
  set({ resourceType: v as typeof defaults.resourceType, page: 1 })
}
function onActionChange(v: unknown) {
  set({ action: v as typeof defaults.action, page: 1 })
}

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  resourceType:
    resourceFilter.value === 'all' ? undefined : (resourceFilter.value as AuditResourceType),
  action: actionFilter.value === 'all' ? undefined : (actionFilter.value as AuditAction),
}))

const { data: pageData, error: listError } = useAuditEventsQuery(queryParams)
const items = computed<AuditEventItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() => resourceFilter.value !== 'all' || actionFilter.value !== 'all')

const resourceOptions = computed(() => [
  { label: t('admin.auditLog.filters.allResources'), value: 'all' },
  // Mirrors the AuditResourceType union + the backend's recorded resource_type strings.
  ...([
    'product',
    'product_image',
    'category',
    'order',
    'customer',
    'customer_note',
    'customer_tag',
    'tag',
    'inventory',
    'review',
  ] as const).map(r => ({
    label: t(`admin.auditLog.resources.${r}`),
    value: r,
  })),
])
const actionOptions = computed(() => [
  { label: t('admin.auditLog.filters.allActions'), value: 'all' },
  ...(['create', 'update', 'delete'] as const).map(a => ({
    label: t(`admin.auditLog.actions.${a}`),
    value: a,
  })),
])

const ACTION_COLOR: Record<string, 'success' | 'primary' | 'error' | 'neutral'> = {
  create: 'success',
  update: 'primary',
  delete: 'error',
}

const columns: TableColumn<AuditEventItem>[] = [
  { accessorKey: 'created_at', header: () => t('admin.auditLog.fields.when') },
  { accessorKey: 'actor_email', header: () => t('admin.auditLog.fields.actor') },
  { accessorKey: 'action', header: () => t('admin.auditLog.fields.action') },
  { accessorKey: 'resource_type', header: () => t('admin.auditLog.fields.resource') },
  { id: 'actions', header: '' },
]

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

const dialogOpen = ref(false)
const selected = ref<AuditEventItem | null>(null)
function openDetails(event: AuditEventItem) {
  selected.value = event
  dialogOpen.value = true
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header>
        <h1 class="text-2xl font-bold">
          {{ $t('admin.auditLog.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ $t('admin.auditLog.subtitle') }}
        </p>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.auditLog.filters.resourceType')">
          <USelect
            :model-value="resourceFilter"
            :items="resourceOptions"
            value-key="value"
            class="w-48"
            @update:model-value="onResourceTypeChange"
          />
        </UFormField>
        <UFormField :label="$t('admin.auditLog.filters.action')">
          <USelect
            :model-value="actionFilter"
            :items="actionOptions"
            value-key="value"
            class="w-44"
            @update:model-value="onActionChange"
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
          {{ $t('admin.auditLog.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.auditLog.empty.noEvents') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #created_at-cell="{ row }">
          <span class="text-sm text-muted whitespace-nowrap">
            {{ formatDate(row.original.created_at) }}
          </span>
        </template>
        <template #actor_email-cell="{ row }">
          <span class="text-sm">{{ row.original.actor_email ?? '—' }}</span>
        </template>
        <template #action-cell="{ row }">
          <UBadge
            :color="ACTION_COLOR[row.original.action] ?? 'neutral'"
            variant="subtle"
          >
            {{ $t(`admin.auditLog.actions.${row.original.action}`, row.original.action) }}
          </UBadge>
        </template>
        <template #resource_type-cell="{ row }">
          <span>
            {{ $t(
              `admin.auditLog.resources.${row.original.resource_type}`,
              row.original.resource_type,
            ) }}
            <span class="text-muted">#{{ row.original.resource_id ?? '—' }}</span>
          </span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-file-text"
              size="sm"
              @click="openDetails(row.original)"
            >
              {{ $t('admin.auditLog.view') }}
            </UButton>
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

      <AdminAuditPayloadDialog
        :open="dialogOpen"
        :event="selected"
        @update:open="(v) => (dialogOpen = v)"
      />
    </div>
  </NuxtLayout>
</template>
