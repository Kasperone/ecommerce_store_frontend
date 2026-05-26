<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { CustomerListItem } from '#shared/types/api'
import type { CustomerRole } from '~/composables/queries/useCustomerQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.customers.title') })

const tri = z.enum(['all', 'true', 'false']).optional()

const filterSchema = z.object({
  role: z.enum(['all', 'CUSTOMER', 'ADMIN']).optional(),
  active: tri,
  verified: tri,
  search: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})

const defaults = {
  role: 'all' as const,
  active: 'all' as const,
  verified: 'all' as const,
  search: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const roleFilter = computed(() => filters.value.role ?? 'all')
const activeFilter = computed(() => filters.value.active ?? 'all')
const verifiedFilter = computed(() => filters.value.verified ?? 'all')
const searchValue = computed(() => filters.value.search ?? '')

function triToBool(v: string | undefined): boolean | undefined {
  if (v === 'true') return true
  if (v === 'false') return false
  return undefined
}

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  role: roleFilter.value === 'all' ? undefined : (roleFilter.value as CustomerRole),
  isActive: triToBool(activeFilter.value),
  isVerified: triToBool(verifiedFilter.value),
  search: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useCustomersQuery(queryParams)
const items = computed<CustomerListItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() =>
  roleFilter.value !== 'all'
  || activeFilter.value !== 'all'
  || verifiedFilter.value !== 'all'
  || searchValue.value.length > 0,
)

const roleOptions = computed(() => [
  { label: t('admin.customers.filters.allRoles'), value: 'all' },
  { label: t('admin.customers.roles.CUSTOMER'), value: 'CUSTOMER' },
  { label: t('admin.customers.roles.ADMIN'), value: 'ADMIN' },
])
const activeOptions = computed(() => [
  { label: t('admin.customers.filters.allStates'), value: 'all' },
  { label: t('admin.customers.filters.activeOnly'), value: 'true' },
  { label: t('admin.customers.filters.inactiveOnly'), value: 'false' },
])
const verifiedOptions = computed(() => [
  { label: t('admin.customers.filters.allVerification'), value: 'all' },
  { label: t('admin.customers.filters.verifiedOnly'), value: 'true' },
  { label: t('admin.customers.filters.unverifiedOnly'), value: 'false' },
])

const columns: TableColumn<CustomerListItem>[] = [
  { accessorKey: 'email', header: () => t('admin.customers.fields.email') },
  { accessorKey: 'name', header: () => t('admin.customers.fields.name') },
  { accessorKey: 'role', header: () => t('admin.customers.fields.role') },
  { accessorKey: 'status', header: () => t('admin.customers.fields.status') },
  { accessorKey: 'order_count', header: () => t('admin.customers.fields.orders') },
  { accessorKey: 'shipping_country', header: () => t('admin.customers.fields.country') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header>
        <h1 class="text-2xl font-bold">
          {{ $t('admin.customers.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ $t('admin.customers.subtitle') }}
        </p>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.customers.filters.role')">
          <USelect
            :model-value="roleFilter"
            :items="roleOptions"
            value-key="value"
            class="w-40"
            @update:model-value="(v) => set({ role: v as typeof defaults.role, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.customers.filters.state')">
          <USelect
            :model-value="activeFilter"
            :items="activeOptions"
            value-key="value"
            class="w-40"
            @update:model-value="(v) => set({ active: v as typeof defaults.active, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.customers.filters.verification')">
          <USelect
            :model-value="verifiedFilter"
            :items="verifiedOptions"
            value-key="value"
            class="w-40"
            @update:model-value="(v) => set({ verified: v as typeof defaults.verified, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.customers.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.customers.filters.searchPlaceholder')"
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
          {{ $t('admin.customers.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.customers.empty.noCustomers') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #email-cell="{ row }">
          <ULink
            :to="`/admin/customers/${row.original.id}`"
            class="font-medium text-primary"
          >
            {{ row.original.email }}
          </ULink>
        </template>
        <template #name-cell="{ row }">
          {{ row.original.first_name }} {{ row.original.last_name }}
        </template>
        <template #role-cell="{ row }">
          <UBadge
            :color="row.original.role === 'ADMIN' ? 'primary' : 'neutral'"
            variant="subtle"
          >
            {{ $t(`admin.customers.roles.${row.original.role}`) }}
          </UBadge>
        </template>
        <template #status-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              :color="row.original.is_active ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ row.original.is_active
                ? $t('admin.customers.status.active')
                : $t('admin.customers.status.inactive') }}
            </UBadge>
            <UBadge
              v-if="!row.original.is_verified"
              color="warning"
              variant="subtle"
            >
              {{ $t('admin.customers.status.unverified') }}
            </UBadge>
            <UBadge
              v-if="row.original.is_locked"
              color="error"
              variant="subtle"
            >
              {{ $t('admin.customers.status.locked') }}
            </UBadge>
          </div>
        </template>
        <template #order_count-cell="{ row }">
          {{ row.original.order_count }}
        </template>
        <template #shipping_country-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.shipping_country ?? '-' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-eye"
              size="sm"
              :aria-label="$t('admin.customers.actions.view')"
              @click="navigateTo(`/admin/customers/${row.original.id}`)"
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
    </div>
  </NuxtLayout>
</template>
