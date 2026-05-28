<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { InventoryMovementItem } from '#shared/types/api'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.inventory.movements.title') })

const filterSchema = z.object({
  productId: z.coerce.number().min(1).optional(),
  warehouseId: z.coerce.number().min(1).optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  productId: undefined as number | undefined,
  warehouseId: undefined as number | undefined,
  page: 1,
  pageSize: 20,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const productId = computed(() => filters.value.productId)
const warehouseId = computed(() => filters.value.warehouseId)

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  productId: productId.value,
  warehouseId: warehouseId.value,
}))

const { data: pageData, error: listError } = useInventoryMovementsQuery(queryParams)
const items = computed<InventoryMovementItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)

const REASON_COLOR: Record<string, 'neutral' | 'warning' | 'primary' | 'success'> = {
  order_placed: 'neutral',
  order_cancelled: 'warning',
  manual_adjustment: 'primary',
  restock: 'success',
  transfer_out: 'warning',
  transfer_in: 'success',
}

const columns: TableColumn<InventoryMovementItem>[] = [
  { accessorKey: 'created_at', header: () => t('admin.inventory.movements.fields.when') },
  { accessorKey: 'product_name', header: () => t('admin.inventory.movements.fields.product') },
  { accessorKey: 'warehouse_name', header: () => t('admin.inventory.movements.fields.warehouse') },
  { accessorKey: 'reason', header: () => t('admin.inventory.movements.fields.reason') },
  { accessorKey: 'delta', header: () => t('admin.inventory.movements.fields.change') },
  { accessorKey: 'resulting_stock', header: () => t('admin.inventory.movements.fields.resulting') },
  { accessorKey: 'note', header: () => t('admin.inventory.movements.fields.note') },
  { accessorKey: 'actor_user_id', header: () => t('admin.inventory.movements.fields.actor') },
]

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

function reasonLabel(reason: string) {
  return t(`admin.inventory.reasons.${reason}`, reason)
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header>
        <UButton
          variant="link"
          color="neutral"
          icon="i-lucide-arrow-left"
          :padded="false"
          @click="navigateTo('/admin/inventory')"
        >
          {{ $t('admin.inventory.movements.back') }}
        </UButton>
        <h1 class="text-2xl font-bold mt-2">
          {{ $t('admin.inventory.movements.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ $t('admin.inventory.movements.subtitle') }}
        </p>
      </header>

      <div
        v-if="productId !== undefined || warehouseId !== undefined"
        class="flex items-center gap-2 flex-wrap"
      >
        <UBadge
          v-if="productId !== undefined"
          color="neutral"
          variant="subtle"
        >
          {{ $t('admin.inventory.movements.filteredByProduct', { id: productId }) }}
        </UBadge>
        <UBadge
          v-if="warehouseId !== undefined"
          color="neutral"
          variant="subtle"
        >
          {{ $t('admin.inventory.movements.filteredByWarehouse', { id: warehouseId }) }}
        </UBadge>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          @click="set({ productId: undefined, warehouseId: undefined, page: 1 })"
        >
          {{ $t('admin.inventory.movements.clearFilter') }}
        </UButton>
      </div>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <div
        v-if="items.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.inventory.movements.empty') }}
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
        <template #product_name-cell="{ row }">
          <span class="font-medium">{{ row.original.product_name }}</span>
        </template>
        <template #warehouse_name-cell="{ row }">
          <span class="text-sm">{{ row.original.warehouse_name ?? '—' }}</span>
        </template>
        <template #reason-cell="{ row }">
          <UBadge
            :color="REASON_COLOR[row.original.reason] ?? 'neutral'"
            variant="subtle"
          >
            {{ reasonLabel(row.original.reason) }}
          </UBadge>
        </template>
        <template #delta-cell="{ row }">
          <span
            class="font-semibold tabular-nums"
            :class="row.original.delta < 0 ? 'text-error' : 'text-success'"
          >
            {{ row.original.delta > 0 ? '+' : '' }}{{ row.original.delta }}
          </span>
        </template>
        <template #resulting_stock-cell="{ row }">
          <span class="tabular-nums">{{ row.original.resulting_stock }}</span>
        </template>
        <template #note-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.note ?? '—' }}</span>
        </template>
        <template #actor_user_id-cell="{ row }">
          <span class="text-sm text-muted">
            {{ row.original.actor_user_id ? `#${row.original.actor_user_id}` : '—' }}
          </span>
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
    </div>
  </NuxtLayout>
</template>
