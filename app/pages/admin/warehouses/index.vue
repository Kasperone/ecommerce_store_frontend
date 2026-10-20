<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { WarehouseResponse } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.warehouses.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'active', 'inactive']).optional(),
  page: z.number().min(1).optional(),
})
const defaults = { status: 'all' as const, page: 1 }
const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: 50,
  isActive:
    statusFilter.value === 'all' ? undefined : statusFilter.value === 'active',
}))

const { data: pageData, error: listError } = useWarehousesQuery(queryParams)
const items = computed<WarehouseResponse[]>(() => pageData.value?.items ?? [])

const statusOptions = computed(() => [
  { label: t('admin.warehouses.filters.all'), value: 'all' },
  { label: t('admin.warehouses.filters.active'), value: 'active' },
  { label: t('admin.warehouses.filters.inactive'), value: 'inactive' },
])

const columns: TableColumn<WarehouseResponse>[] = [
  { accessorKey: 'code', header: () => t('admin.warehouses.fields.code') },
  { accessorKey: 'name', header: () => t('admin.warehouses.fields.name') },
  { accessorKey: 'is_default', header: () => t('admin.warehouses.fields.default') },
  { accessorKey: 'is_active', header: () => t('admin.warehouses.fields.status') },
  { id: 'actions', header: '' },
]

// Create / edit modal.
const formOpen = ref(false)
const editing = ref<WarehouseResponse | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit(warehouse: WarehouseResponse) {
  editing.value = warehouse
  formOpen.value = true
}

// Delete confirmation.
const deleteOpen = ref(false)
const deleteTarget = ref<WarehouseResponse | null>(null)
const deleteError = ref<ProblemDetails | null>(null)
const deleteWarehouse = useDeleteWarehouse()
const toast = useToast()

function openDelete(warehouse: WarehouseResponse) {
  deleteTarget.value = warehouse
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete() {
  if (deleteTarget.value === null) return
  deleteError.value = null
  try {
    await deleteWarehouse.mutateAsync(deleteTarget.value.id)
    toast.add({
      title: t('admin.warehouses.flashes.deleted'),
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
            {{ $t('admin.warehouses.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.warehouses.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="openCreate"
        >
          {{ $t('admin.warehouses.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.warehouses.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
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
        {{ $t('admin.warehouses.empty') }}
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #code-cell="{ row }">
          <span class="font-mono font-medium">{{ row.original.code }}</span>
        </template>
        <template #name-cell="{ row }">
          {{ row.original.name }}
        </template>
        <template #is_default-cell="{ row }">
          <UBadge
            v-if="row.original.is_default"
            color="primary"
            variant="subtle"
          >
            {{ $t('admin.warehouses.badges.default') }}
          </UBadge>
          <span
            v-else
            class="text-muted"
          >—</span>
        </template>
        <template #is_active-cell="{ row }">
          <UBadge
            :color="row.original.is_active ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{
              row.original.is_active
                ? $t('admin.warehouses.badges.active')
                : $t('admin.warehouses.badges.inactive')
            }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.warehouses.actions.edit')"
              @click="openEdit(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :disabled="row.original.is_default"
              :aria-label="$t('admin.warehouses.actions.delete')"
              @click="openDelete(row.original)"
            />
          </div>
        </template>
      </UTable>

      <AdminWarehouseFormModal
        :open="formOpen"
        :warehouse="editing"
        @update:open="(v) => (formOpen = v)"
      />

      <UModal
        v-model:open="deleteOpen"
        :title="$t('admin.warehouses.delete.title')"
      >
        <template #body>
          <ErrorAlert
            v-if="deleteError"
            :problem="deleteError"
            class="mb-4"
          />
          <p class="text-sm">
            {{ $t('admin.warehouses.delete.confirm', { name: deleteTarget?.name ?? '' }) }}
          </p>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="soft"
              @click="() => { deleteOpen = false }"
            >
              {{ $t('admin.warehouses.delete.cancel') }}
            </UButton>
            <UButton
              color="error"
              :loading="deleteWarehouse.isLoading.value"
              @click="confirmDelete"
            >
              {{ $t('admin.warehouses.delete.delete') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>
