<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { GiftCardResponse } from '~/composables/queries/useGiftCardQueries'
import { parseProblem } from '#shared/utils/problemDetails'
import { formatMoney, type CurrencyCode } from '#shared/utils/money'
import { giftCardStatusColor, isGiftCardExpired, maskGiftCardCode } from '#shared/utils/giftCard'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const localePath = useLocalePath()
useHead({ title: () => t('admin.giftCards.title') })

const filterSchema = z.object({
  status: z.enum(['all', 'active', 'disabled']).optional(),
  currency: z.enum(['all', 'USD', 'PLN', 'EUR']).optional(),
  q: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})
const defaults = {
  status: 'all' as const,
  currency: 'all' as const,
  q: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

const statusFilter = computed(() => filters.value.status ?? 'all')
const currencyFilter = computed(() => filters.value.currency ?? 'all')
const searchValue = computed(() => filters.value.q ?? '')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  status: statusFilter.value === 'all' ? undefined : statusFilter.value,
  currency: currencyFilter.value === 'all' ? undefined : currencyFilter.value,
  q: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useGiftCardsQuery(queryParams)
const items = computed<GiftCardResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() =>
  statusFilter.value !== 'all' || currencyFilter.value !== 'all' || searchValue.value.length > 0,
)

const statusOptions = computed(() => [
  { label: t('admin.giftCards.filters.all'), value: 'all' },
  { label: t('admin.giftCards.filters.active'), value: 'active' },
  { label: t('admin.giftCards.filters.disabled'), value: 'disabled' },
])
const currencyOptions = computed(() => [
  { label: t('admin.giftCards.filters.allCurrencies'), value: 'all' },
  { label: 'USD', value: 'USD' },
  { label: 'PLN', value: 'PLN' },
  { label: 'EUR', value: 'EUR' },
])

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}
function money(amount: number, currency: string) {
  return formatMoney(amount, currency as CurrencyCode, 'en')
}

const columns: TableColumn<GiftCardResponse>[] = [
  { accessorKey: 'last4', header: () => t('admin.giftCards.fields.code') },
  { accessorKey: 'balance', header: () => t('admin.giftCards.fields.balance') },
  { accessorKey: 'status', header: () => t('admin.giftCards.fields.status') },
  { accessorKey: 'expires_at', header: () => t('admin.giftCards.fields.expiresAt') },
  { accessorKey: 'recipient_email', header: () => t('admin.giftCards.fields.recipient') },
  { id: 'actions', header: '' },
]

// Issue modal.
const issueOpen = ref(false)
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.giftCards.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.giftCards.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          data-testid="gift-card-issue-button"
          @click="issueOpen = true"
        >
          {{ $t('admin.giftCards.actions.issue') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.giftCards.filters.status')">
          <USelect
            :model-value="statusFilter"
            :items="statusOptions"
            value-key="value"
            class="w-40"
            @update:model-value="(v) => set({ status: v as typeof defaults.status, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.giftCards.filters.currency')">
          <USelect
            :model-value="currencyFilter"
            :items="currencyOptions"
            value-key="value"
            class="w-40"
            @update:model-value="(v) => set({ currency: v as typeof defaults.currency, page: 1 })"
          />
        </UFormField>
        <UFormField :label="$t('admin.giftCards.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.giftCards.filters.searchPlaceholder')"
            icon="i-lucide-search"
            class="w-64"
            @update:model-value="(v) => set({ q: (v as string) || undefined, page: 1 })"
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
          {{ $t('admin.giftCards.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.giftCards.empty.noCards') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #last4-cell="{ row }">
          <span class="font-mono font-medium">{{ maskGiftCardCode(row.original.last4) }}</span>
        </template>
        <template #balance-cell="{ row }">
          <span class="font-medium">{{ money(row.original.balance, row.original.currency) }}</span>
          <span class="text-muted text-xs ml-1">
            / {{ money(row.original.initial_value, row.original.currency) }}
          </span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="giftCardStatusColor(row.original.status)"
            variant="subtle"
          >
            {{ $t(`admin.giftCards.status.${row.original.status}`) }}
          </UBadge>
          <UBadge
            v-if="isGiftCardExpired(row.original.expires_at)"
            class="ml-1"
            color="warning"
            variant="subtle"
            data-testid="gift-card-expired-badge"
          >
            {{ $t('admin.giftCards.status.expired') }}
          </UBadge>
        </template>
        <template #expires_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.expires_at) }}</span>
        </template>
        <template #recipient_email-cell="{ row }">
          <span class="text-sm">{{ row.original.recipient_email ?? '—' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-eye"
              size="sm"
              :aria-label="$t('admin.giftCards.actions.view')"
              :to="localePath(`/admin/gift-cards/${row.original.id}`)"
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

      <AdminGiftCardIssueModal
        :open="issueOpen"
        @update:open="(v) => (issueOpen = v)"
      />
    </div>
  </NuxtLayout>
</template>
