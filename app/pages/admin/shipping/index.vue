<script setup lang="ts">
/**
 * Admin Shipping — tabbed page for zones, methods, and rates.
 *
 * The three concepts are tightly coupled (rates exist only when both a zone
 * and a method exist), so they share one page with a `<UTabs>` switch. Tab
 * state lives in the URL (`?tab=zones|methods|rates`) via `useUrlFilters` so
 * deep-links work. Each tab has its own table + "New …" button opening the
 * matching dialog; row-clicks open the same dialog in edit mode. Deletes are
 * confirmed via `<UModal>` (small + inline).
 *
 * Rates list supports zone/method/currency filter dropdowns — the matrix can
 * grow large once admins start configuring per-country zones.
 */

import { computed, ref } from 'vue'
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import { countryName } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'
import type {
  ShippingMethodResponse,
  ShippingRateListItem,
  ShippingZoneListItem,
} from '#shared/types/api'
import type { ShippingCurrency } from '~/composables/queries/useShippingQueries'

definePageMeta({ middleware: ['admin'], layout: 'admin' })

const { t, locale } = useI18n()
const toast = useToast()
useHead({ title: () => t('admin.shipping.title') })

const filterSchema = z.object({
  tab: z.enum(['zones', 'methods', 'rates']).optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  methodId: z.coerce.number().int().positive().optional(),
  currency: z.enum(['USD', 'PLN', 'EUR']).optional(),
})
const defaults = {
  tab: 'zones' as const,
  zoneId: undefined as number | undefined,
  methodId: undefined as number | undefined,
  currency: undefined as ShippingCurrency | undefined,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

const tabModel = computed({
  get: () => filters.value.tab ?? 'zones',
  set: (value: string) => set('tab', value as 'zones' | 'methods' | 'rates'),
})
const tabItems = computed(() => [
  { label: t('admin.shipping.tabs.zones'), value: 'zones' },
  { label: t('admin.shipping.tabs.methods'), value: 'methods' },
  { label: t('admin.shipping.tabs.rates'), value: 'rates' },
])

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

// Backend caps page_size at 100 — zone counts in practice fit comfortably.
const { data: zonesPage, refresh: refreshZones } = useShippingZonesQuery({ pageSize: 100 })
const zones = computed<ShippingZoneListItem[]>(() => zonesPage.value?.items ?? [])

const zoneDialogOpen = ref(false)
const editingZone = ref<ShippingZoneListItem | null>(null)
const editingZoneCountries = ref<string[]>([])

// The list payload doesn't carry country_codes — fetch the detail when the
// admin clicks edit so the multi-select prefills correctly.
const { data: editingZoneDetail } = useShippingZoneQuery(() => editingZone.value?.id ?? null)
watch(editingZoneDetail, (detail) => {
  if (detail) editingZoneCountries.value = detail.country_codes
})

function openCreateZone() {
  editingZone.value = null
  editingZoneCountries.value = []
  zoneDialogOpen.value = true
}
function openEditZone(zone: ShippingZoneListItem) {
  editingZone.value = zone
  editingZoneCountries.value = []
  zoneDialogOpen.value = true
}

const deleteZone = useDeleteShippingZone()
const zoneToDelete = ref<ShippingZoneListItem | null>(null)
async function confirmDeleteZone() {
  if (!zoneToDelete.value) return
  try {
    await deleteZone.mutateAsync(zoneToDelete.value.id)
    toast.add({ title: t('admin.shipping.flashes.zoneDeleted') })
  }
  catch {
    toast.add({ title: t('admin.shipping.flashes.zoneDeleteError'), color: 'error' })
  }
  finally {
    zoneToDelete.value = null
  }
}

const zoneColumns: TableColumn<ShippingZoneListItem>[] = [
  { accessorKey: 'name', header: () => t('admin.shipping.zones.fields.name') },
  { accessorKey: 'country_count', header: () => t('admin.shipping.zones.fields.countries') },
  { accessorKey: 'rate_count', header: () => t('admin.shipping.zones.fields.rates') },
  { accessorKey: 'sort_order', header: () => t('admin.shipping.zones.fields.sortOrder') },
  { accessorKey: 'is_active', header: () => t('admin.shipping.zones.fields.active') },
  { id: 'actions', header: '' },
]

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

const { data: methodsPage, refresh: refreshMethods } = useShippingMethodsQuery({ pageSize: 100 })
const methods = computed<ShippingMethodResponse[]>(() => methodsPage.value?.items ?? [])

const methodDialogOpen = ref(false)
const editingMethod = ref<ShippingMethodResponse | null>(null)
function openCreateMethod() {
  editingMethod.value = null
  methodDialogOpen.value = true
}
function openEditMethod(method: ShippingMethodResponse) {
  editingMethod.value = method
  methodDialogOpen.value = true
}

const deleteMethod = useDeleteShippingMethod()
const methodToDelete = ref<ShippingMethodResponse | null>(null)
async function confirmDeleteMethod() {
  if (!methodToDelete.value) return
  try {
    await deleteMethod.mutateAsync(methodToDelete.value.id)
    toast.add({ title: t('admin.shipping.flashes.methodDeleted') })
  }
  catch {
    toast.add({ title: t('admin.shipping.flashes.methodDeleteError'), color: 'error' })
  }
  finally {
    methodToDelete.value = null
  }
}

const methodColumns: TableColumn<ShippingMethodResponse>[] = [
  { accessorKey: 'name', header: () => t('admin.shipping.methods.fields.name') },
  { accessorKey: 'code', header: () => t('admin.shipping.methods.fields.code') },
  { accessorKey: 'sort_order', header: () => t('admin.shipping.methods.fields.sortOrder') },
  { accessorKey: 'is_active', header: () => t('admin.shipping.methods.fields.active') },
  { id: 'actions', header: '' },
]

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

const ratesParams = computed(() => ({
  // Backend caps page_size at 100 — the typical (zone × method × currency)
  // matrix in any one country/currency view stays well under that. If the
  // catalogue grows past this, add pagination instead of bumping the cap.
  pageSize: 100,
  zoneId: filters.value.zoneId,
  methodId: filters.value.methodId,
  currency: filters.value.currency,
}))
const { data: ratesPage, refresh: refreshRates } = useShippingRatesQuery(ratesParams)
const rates = computed<ShippingRateListItem[]>(() => ratesPage.value?.items ?? [])

const rateDialogOpen = ref(false)
const editingRate = ref<ShippingRateListItem | null>(null)
function openCreateRate() {
  editingRate.value = null
  rateDialogOpen.value = true
}
function openEditRate(rate: ShippingRateListItem) {
  editingRate.value = rate
  rateDialogOpen.value = true
}

const deleteRate = useDeleteShippingRate()
const rateToDelete = ref<ShippingRateListItem | null>(null)
async function confirmDeleteRate() {
  if (!rateToDelete.value) return
  try {
    await deleteRate.mutateAsync(rateToDelete.value.id)
    toast.add({ title: t('admin.shipping.flashes.rateDeleted') })
  }
  catch {
    toast.add({ title: t('admin.shipping.flashes.rateDeleteError'), color: 'error' })
  }
  finally {
    rateToDelete.value = null
  }
}

const rateColumns: TableColumn<ShippingRateListItem>[] = [
  { accessorKey: 'zone_name', header: () => t('admin.shipping.rates.fields.zone') },
  { accessorKey: 'method_name', header: () => t('admin.shipping.rates.fields.method') },
  { accessorKey: 'currency', header: () => t('admin.shipping.rates.fields.currency') },
  { accessorKey: 'amount', header: () => t('admin.shipping.rates.fields.amount') },
  { accessorKey: 'pricing_kind', header: () => t('admin.shipping.rates.fields.kind') },
  { id: 'actions', header: '' },
]

const PRICING_KIND_COLOR: Record<string, 'success' | 'warning' | 'info'> = {
  flat: 'success',
  free_above: 'info',
  tiered: 'warning',
}

const zoneFilterOptions = computed(() => [
  { label: t('admin.shipping.rates.filters.allZones'), value: undefined },
  ...zones.value.map(z => ({ label: z.name, value: z.id })),
])
const methodFilterOptions = computed(() => [
  { label: t('admin.shipping.rates.filters.allMethods'), value: undefined },
  ...methods.value.map(m => ({ label: m.name, value: m.id })),
])
const currencyFilterOptions = computed(() => [
  { label: t('admin.shipping.rates.filters.allCurrencies'), value: undefined },
  { label: 'USD', value: 'USD' as ShippingCurrency },
  { label: 'PLN', value: 'PLN' as ShippingCurrency },
  { label: 'EUR', value: 'EUR' as ShippingCurrency },
])

function localizedCountries(codes: string[]): string {
  return codes.map(c => countryName(c, locale.value as SupportedLocale)).join(', ')
}
// Re-exported only to silence "unused" — read by the spec via defineExpose.
defineExpose({ localizedCountries })
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header>
        <h1 class="text-2xl font-bold">
          {{ t('admin.shipping.title') }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ t('admin.shipping.subtitle') }}
        </p>
      </header>

      <UTabs
        v-model="tabModel"
        :items="tabItems"
        :ui="{ list: 'max-w-md' }"
      >
        <template #content="{ item }">
          <!-- Zones tab -->
          <section
            v-if="item.value === 'zones'"
            class="space-y-3"
          >
            <div class="flex justify-end">
              <UButton
                color="primary"
                icon="i-lucide-plus"
                @click="openCreateZone"
              >
                {{ t('admin.shipping.zones.new') }}
              </UButton>
            </div>
            <UTable
              :data="zones"
              :columns="zoneColumns"
              :empty="{ label: t('admin.shipping.zones.empty') }"
            >
              <template #is_active-cell="{ row }">
                <UBadge :color="row.original.is_active ? 'success' : 'neutral'">
                  {{ row.original.is_active
                    ? t('admin.shipping.zones.fields.activeOn')
                    : t('admin.shipping.zones.fields.activeOff') }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-2">
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-pencil"
                    :aria-label="t('actions.edit')"
                    @click="openEditZone(row.original)"
                  />
                  <UButton
                    variant="ghost"
                    size="sm"
                    color="error"
                    icon="i-lucide-trash-2"
                    :aria-label="t('actions.delete')"
                    @click="zoneToDelete = row.original"
                  />
                </div>
              </template>
            </UTable>
          </section>

          <!-- Methods tab -->
          <section
            v-else-if="item.value === 'methods'"
            class="space-y-3"
          >
            <div class="flex justify-end">
              <UButton
                color="primary"
                icon="i-lucide-plus"
                @click="openCreateMethod"
              >
                {{ t('admin.shipping.methods.new') }}
              </UButton>
            </div>
            <UTable
              :data="methods"
              :columns="methodColumns"
              :empty="{ label: t('admin.shipping.methods.empty') }"
            >
              <template #is_active-cell="{ row }">
                <UBadge :color="row.original.is_active ? 'success' : 'neutral'">
                  {{ row.original.is_active
                    ? t('admin.shipping.methods.fields.activeOn')
                    : t('admin.shipping.methods.fields.activeOff') }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-2">
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-pencil"
                    :aria-label="t('actions.edit')"
                    @click="openEditMethod(row.original)"
                  />
                  <UButton
                    variant="ghost"
                    size="sm"
                    color="error"
                    icon="i-lucide-trash-2"
                    :aria-label="t('actions.delete')"
                    @click="methodToDelete = row.original"
                  />
                </div>
              </template>
            </UTable>
          </section>

          <!-- Rates tab -->
          <section
            v-else-if="item.value === 'rates'"
            class="space-y-3"
          >
            <div class="flex flex-wrap items-end gap-3">
              <UFormField
                :label="t('admin.shipping.rates.filters.zone')"
                class="min-w-40"
              >
                <USelectMenu
                  :model-value="filters.zoneId"
                  :items="zoneFilterOptions"
                  value-key="value"
                  class="w-full"
                  @update:model-value="(v: number | undefined) => set('zoneId', v)"
                />
              </UFormField>
              <UFormField
                :label="t('admin.shipping.rates.filters.method')"
                class="min-w-40"
              >
                <USelectMenu
                  :model-value="filters.methodId"
                  :items="methodFilterOptions"
                  value-key="value"
                  class="w-full"
                  @update:model-value="(v: number | undefined) => set('methodId', v)"
                />
              </UFormField>
              <UFormField
                :label="t('admin.shipping.rates.filters.currency')"
                class="min-w-32"
              >
                <USelect
                  :model-value="filters.currency"
                  :items="currencyFilterOptions"
                  value-key="value"
                  class="w-full"
                  @update:model-value="(v: ShippingCurrency | undefined) => set('currency', v)"
                />
              </UFormField>
              <div class="ml-auto">
                <UButton
                  color="primary"
                  icon="i-lucide-plus"
                  :disabled="zones.length === 0 || methods.length === 0"
                  @click="openCreateRate"
                >
                  {{ t('admin.shipping.rates.new') }}
                </UButton>
              </div>
            </div>
            <UTable
              :data="rates"
              :columns="rateColumns"
              :empty="{ label: t('admin.shipping.rates.empty') }"
            >
              <template #amount-cell="{ row }">
                {{ row.original.amount.toFixed(2) }} {{ row.original.currency }}
              </template>
              <template #pricing_kind-cell="{ row }">
                <UBadge :color="PRICING_KIND_COLOR[row.original.pricing_kind] ?? 'neutral'">
                  {{ t(`admin.shipping.rates.pricingKind.${row.original.pricing_kind}`) }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-2">
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-pencil"
                    :aria-label="t('actions.edit')"
                    @click="openEditRate(row.original)"
                  />
                  <UButton
                    variant="ghost"
                    size="sm"
                    color="error"
                    icon="i-lucide-trash-2"
                    :aria-label="t('actions.delete')"
                    @click="rateToDelete = row.original"
                  />
                </div>
              </template>
            </UTable>
          </section>
        </template>
      </UTabs>
    </div>

    <!-- Dialogs -->
    <AdminShippingZoneFormDialog
      v-model:open="zoneDialogOpen"
      :zone="editingZone"
      :initial-country-codes="editingZoneCountries"
      @saved="refreshZones"
    />
    <AdminShippingMethodFormDialog
      v-model:open="methodDialogOpen"
      :method="editingMethod"
      @saved="refreshMethods"
    />
    <AdminShippingRateFormDialog
      v-model:open="rateDialogOpen"
      :rate="editingRate"
      :zones="zones"
      :methods="methods"
      @saved="refreshRates"
    />

    <!-- Delete confirmations (inline modals) -->
    <UModal
      :open="!!zoneToDelete"
      @update:open="(v) => { if (!v) zoneToDelete = null }"
    >
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-base font-semibold">
              {{ t('admin.shipping.zones.deleteConfirm.title') }}
            </h2>
          </template>
          <p class="text-sm">
            {{ t('admin.shipping.zones.deleteConfirm.body', { name: zoneToDelete?.name ?? '' }) }}
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                @click="zoneToDelete = null"
              >
                {{ t('actions.cancel') }}
              </UButton>
              <UButton
                color="error"
                @click="confirmDeleteZone"
              >
                {{ t('actions.delete') }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      :open="!!methodToDelete"
      @update:open="(v) => { if (!v) methodToDelete = null }"
    >
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-base font-semibold">
              {{ t('admin.shipping.methods.deleteConfirm.title') }}
            </h2>
          </template>
          <p class="text-sm">
            {{ t('admin.shipping.methods.deleteConfirm.body', { name: methodToDelete?.name ?? '' }) }}
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                @click="methodToDelete = null"
              >
                {{ t('actions.cancel') }}
              </UButton>
              <UButton
                color="error"
                @click="confirmDeleteMethod"
              >
                {{ t('actions.delete') }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      :open="!!rateToDelete"
      @update:open="(v) => { if (!v) rateToDelete = null }"
    >
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-base font-semibold">
              {{ t('admin.shipping.rates.deleteConfirm.title') }}
            </h2>
          </template>
          <p class="text-sm">
            {{ t('admin.shipping.rates.deleteConfirm.body', {
              zone: rateToDelete?.zone_name ?? '',
              method: rateToDelete?.method_name ?? '',
              currency: rateToDelete?.currency ?? '',
            }) }}
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                @click="rateToDelete = null"
              >
                {{ t('actions.cancel') }}
              </UButton>
              <UButton
                color="error"
                @click="confirmDeleteRate"
              >
                {{ t('actions.delete') }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </NuxtLayout>
</template>
