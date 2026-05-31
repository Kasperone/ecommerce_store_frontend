<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { CouponResponse } from '~/composables/queries/useCouponQueries'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.coupons.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'active', 'inactive']).optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})
const defaults = {
  status: 'all' as const,
  search: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')
const searchValue = computed(() => filters.value.search ?? '')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  isActive:
    statusFilter.value === 'all' ? undefined : statusFilter.value === 'active',
  search: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useCouponsQuery(queryParams)
const items = computed<CouponResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() =>
  statusFilter.value !== 'all' || searchValue.value.length > 0,
)

const statusOptions = computed(() => [
  { label: t('admin.coupons.filters.all'), value: 'all' },
  { label: t('admin.coupons.filters.active'), value: 'active' },
  { label: t('admin.coupons.filters.inactive'), value: 'inactive' },
])

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function formatDiscount(coupon: CouponResponse) {
  if (coupon.discount_type === 'percent') return `${coupon.value}%`
  return `${coupon.value} ${coupon.currency ?? ''}`.trim()
}

function formatUsage(coupon: CouponResponse) {
  return coupon.max_uses == null
    ? String(coupon.used_count)
    : `${coupon.used_count} / ${coupon.max_uses}`
}

const columns: TableColumn<CouponResponse>[] = [
  { accessorKey: 'code', header: () => t('admin.coupons.fields.code') },
  { accessorKey: 'discount', header: () => t('admin.coupons.fields.discount') },
  { accessorKey: 'used_count', header: () => t('admin.coupons.fields.usedCount') },
  { accessorKey: 'starts_at', header: () => t('admin.coupons.fields.startsAt') },
  { accessorKey: 'ends_at', header: () => t('admin.coupons.fields.endsAt') },
  { accessorKey: 'is_active', header: () => t('admin.coupons.fields.status') },
  { id: 'actions', header: '' },
]

// Create / edit modal.
const formOpen = ref(false)
const editing = ref<CouponResponse | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit(coupon: CouponResponse) {
  editing.value = coupon
  formOpen.value = true
}

// Delete confirmation.
const deleteOpen = ref(false)
const deleteTarget = ref<CouponResponse | null>(null)
const deleteError = ref<ProblemDetails | null>(null)
const deleteCoupon = useDeleteCoupon()
const toast = useToast()

function openDelete(coupon: CouponResponse) {
  deleteTarget.value = coupon
  deleteError.value = null
  deleteOpen.value = true
}

async function confirmDelete(id: number) {
  deleteError.value = null
  try {
    await deleteCoupon.mutateAsync(id)
    toast.add({
      title: t('admin.coupons.flashes.deleted'),
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
            {{ $t('admin.coupons.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.coupons.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="openCreate"
        >
          {{ $t('admin.coupons.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.coupons.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-48"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.coupons.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.coupons.filters.searchPlaceholder')"
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
          {{ $t('admin.coupons.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.coupons.empty.noCoupons') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #code-cell="{ row }">
          <span class="font-mono font-medium">{{ row.original.code }}</span>
          <p
            v-if="row.original.description"
            class="text-muted text-xs mt-0.5 max-w-xs truncate"
          >
            {{ row.original.description }}
          </p>
        </template>
        <template #discount-cell="{ row }">
          <span class="font-medium">{{ formatDiscount(row.original) }}</span>
          <UBadge
            class="ml-2"
            color="neutral"
            variant="subtle"
          >
            {{ $t(`admin.coupons.discountType.${row.original.discount_type}`) }}
          </UBadge>
        </template>
        <template #used_count-cell="{ row }">
          {{ formatUsage(row.original) }}
        </template>
        <template #starts_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.starts_at) }}</span>
        </template>
        <template #ends_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.ends_at) }}</span>
        </template>
        <template #is_active-cell="{ row }">
          <UBadge
            :color="row.original.is_active ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{
              row.original.is_active
                ? $t('admin.coupons.status.active')
                : $t('admin.coupons.status.inactive')
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
              :aria-label="$t('admin.coupons.actions.edit')"
              @click="openEdit(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :aria-label="$t('admin.coupons.actions.delete')"
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

      <AdminCouponFormModal
        :open="formOpen"
        :coupon="editing"
        @update:open="(v) => (formOpen = v)"
      />

      <AdminCouponDeleteConfirm
        :open="deleteOpen"
        :coupon="deleteTarget"
        :loading="deleteCoupon.isLoading.value"
        :error="deleteError"
        @update:open="(v) => (deleteOpen = v)"
        @confirm="confirmDelete"
      />
    </div>
  </NuxtLayout>
</template>
