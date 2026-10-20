<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  PriceListEntryCreate,
  PriceListEntryResponse,
} from '~/composables/queries/usePriceListQueries'
import { parseProblem } from '#shared/utils/problemDetails'
import { formatMoney } from '#shared/utils/money'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

const listId = computed(() => Number(route.params.id))

const { data: priceList, error: loadError, status } = usePriceListQuery(listId)
const isLoading = computed(() => status.value === 'pending')

useHead({ title: () => priceList.value?.name ?? t('admin.priceLists.detail.title') })

const entries = computed<PriceListEntryResponse[]>(() => priceList.value?.entries ?? [])

// --- header edit ----------------------------------------------------------
const editOpen = ref(false)

// --- entry add / edit -----------------------------------------------------
// One form panel does both: with `editingEntryId === null` it POSTs a new entry
// (product chosen via the picker); editing a row loads that row's product + prices
// and PATCHes it (the product/grain is fixed on edit).
const editingEntryId = ref<number | null>(null)
const pickedProductId = ref<number | null>(null)
const editingProductName = ref<string | null>(null)
const priceUsd = ref<number | undefined>(undefined)
const pricePln = ref<number | undefined>(undefined)
const priceEur = ref<number | undefined>(undefined)

const addEntry = useAddPriceListEntry()
const updateEntry = useUpdatePriceListEntry()
const deleteEntry = useDeletePriceListEntry()

const saving = computed(() => addEntry.isLoading.value || updateEntry.isLoading.value)
const isEditingEntry = computed(() => editingEntryId.value !== null)

function resetEntryForm() {
  editingEntryId.value = null
  pickedProductId.value = null
  editingProductName.value = null
  priceUsd.value = undefined
  pricePln.value = undefined
  priceEur.value = undefined
}

function startEditEntry(entry: PriceListEntryResponse) {
  editingEntryId.value = entry.id
  pickedProductId.value = entry.product_id
  editingProductName.value = entry.product_name ?? `#${entry.product_id}`
  priceUsd.value = entry.price_usd ?? undefined
  pricePln.value = entry.price_pln ?? undefined
  priceEur.value = entry.price_eur ?? undefined
}

const hasAnyPrice = computed(
  () => priceUsd.value != null || pricePln.value != null || priceEur.value != null,
)
const canSaveEntry = computed(
  () => hasAnyPrice.value && (isEditingEntry.value || pickedProductId.value != null),
)

async function onSaveEntry() {
  if (!canSaveEntry.value) return
  try {
    if (isEditingEntry.value && editingEntryId.value != null) {
      await updateEntry.mutateAsync({
        listId: listId.value,
        entryId: editingEntryId.value,
        patch: {
          price_usd: priceUsd.value ?? null,
          price_pln: pricePln.value ?? null,
          price_eur: priceEur.value ?? null,
        },
      })
    }
    else if (pickedProductId.value != null) {
      const body: PriceListEntryCreate = {
        product_id: pickedProductId.value,
        variant_id: null,
        price_usd: priceUsd.value ?? null,
        price_pln: pricePln.value ?? null,
        price_eur: priceEur.value ?? null,
      }
      await addEntry.mutateAsync({ listId: listId.value, body })
    }
    toast.add({
      title: t('admin.priceLists.flashes.entrySaved'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    resetEntryForm()
  }
  catch (err) {
    toast.add({
      title: parseProblem(err)?.detail ?? t('admin.priceLists.flashes.entryError'),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
}

async function onDeleteEntry(entry: PriceListEntryResponse) {
  try {
    await deleteEntry.mutateAsync({ listId: listId.value, entryId: entry.id })
    if (editingEntryId.value === entry.id) resetEntryForm()
    toast.add({
      title: t('admin.priceLists.flashes.entryDeleted'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    toast.add({
      title: parseProblem(err)?.detail ?? t('admin.priceLists.flashes.entryError'),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
}

function money(amount: number | null | undefined, currency: 'USD' | 'PLN' | 'EUR') {
  if (amount == null) return '—'
  return formatMoney(amount, currency, locale.value)
}

const columns: TableColumn<PriceListEntryResponse>[] = [
  { accessorKey: 'product_name', header: () => t('admin.priceLists.entries.product') },
  { accessorKey: 'price_usd', header: () => 'USD' },
  { accessorKey: 'price_pln', header: () => 'PLN' },
  { accessorKey: 'price_eur', header: () => 'EUR' },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <div>
        <ULink
          :to="localePath('/admin/price-lists')"
          class="text-sm text-muted hover:text-primary"
        >
          ← {{ $t('admin.priceLists.detail.back') }}
        </ULink>
      </div>

      <ErrorAlert
        v-if="loadError"
        :problem="parseProblem(loadError)"
      />

      <div
        v-else-if="isLoading"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('common.loading') }}
      </div>

      <template v-else-if="priceList">
        <header class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold">
                {{ priceList.name }}
              </h1>
              <UBadge
                :color="priceList.is_active ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ priceList.is_active
                  ? $t('admin.priceLists.status.active')
                  : $t('admin.priceLists.status.inactive') }}
              </UBadge>
            </div>
            <p
              v-if="priceList.notes"
              class="text-muted text-sm mt-1"
            >
              {{ priceList.notes }}
            </p>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            @click="editOpen = true"
          >
            {{ $t('admin.priceLists.actions.editHeader') }}
          </UButton>
        </header>

        <!-- Add / edit entry -->
        <div class="border border-default rounded-lg p-4 space-y-4">
          <h2 class="font-semibold">
            {{ isEditingEntry
              ? $t('admin.priceLists.entries.editTitle')
              : $t('admin.priceLists.entries.addTitle') }}
          </h2>

          <UFormField :label="$t('admin.priceLists.entries.product')">
            <div
              v-if="isEditingEntry"
              class="text-sm font-medium"
            >
              {{ editingProductName }}
            </div>
            <AdminCmsProductPicker
              v-else
              v-model="pickedProductId"
              mode="product"
            />
          </UFormField>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UFormField label="USD">
              <UInputNumber
                v-model="priceUsd"
                :min="0"
                :step="0.01"
                class="w-full"
                data-testid="entry-price-usd"
              />
            </UFormField>
            <UFormField label="PLN">
              <UInputNumber
                v-model="pricePln"
                :min="0"
                :step="0.01"
                class="w-full"
              />
            </UFormField>
            <UFormField label="EUR">
              <UInputNumber
                v-model="priceEur"
                :min="0"
                :step="0.01"
                class="w-full"
              />
            </UFormField>
          </div>

          <p class="text-xs text-muted">
            {{ $t('admin.priceLists.entries.priceHint') }}
          </p>

          <div class="flex items-center gap-2">
            <UButton
              color="primary"
              :loading="saving"
              :disabled="!canSaveEntry"
              data-testid="entry-save"
              @click="onSaveEntry"
            >
              {{ isEditingEntry
                ? $t('admin.priceLists.entries.update')
                : $t('admin.priceLists.entries.add') }}
            </UButton>
            <UButton
              v-if="isEditingEntry"
              color="neutral"
              variant="ghost"
              @click="resetEntryForm"
            >
              {{ $t('admin.priceLists.entries.cancelEdit') }}
            </UButton>
          </div>
        </div>

        <!-- Entries table -->
        <div
          v-if="entries.length === 0"
          class="text-muted text-sm py-8 text-center"
        >
          {{ $t('admin.priceLists.entries.empty') }}
        </div>

        <UTable
          v-else
          :data="entries"
          :columns="columns"
          :ui="{ td: 'align-middle' }"
        >
          <template #product_name-cell="{ row }">
            <span class="text-sm font-medium">{{ row.original.product_name ?? `#${row.original.product_id}` }}</span>
          </template>
          <template #price_usd-cell="{ row }">
            {{ money(row.original.price_usd, 'USD') }}
          </template>
          <template #price_pln-cell="{ row }">
            {{ money(row.original.price_pln, 'PLN') }}
          </template>
          <template #price_eur-cell="{ row }">
            {{ money(row.original.price_eur, 'EUR') }}
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                size="sm"
                :aria-label="$t('admin.priceLists.actions.edit')"
                @click="startEditEntry(row.original)"
              />
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                size="sm"
                :aria-label="$t('admin.priceLists.actions.delete')"
                @click="onDeleteEntry(row.original)"
              />
            </div>
          </template>
        </UTable>

        <AdminPriceListFormModal
          v-model:open="editOpen"
          :price-list="priceList"
        />
      </template>
    </div>
  </NuxtLayout>
</template>
