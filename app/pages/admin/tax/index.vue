<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { TaxCategoryResponse, TaxRateResponse } from '#shared/types/api'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
const toast = useToast()
useHead({ title: () => t('admin.tax.title') })

const TAX_HOME_COUNTRY = 'PL'

const { data: categoriesData, error: listError } = useTaxCategoriesQuery()
const categories = computed<TaxCategoryResponse[]>(() => categoriesData.value ?? [])

// Which category's rates are shown. Defaults to the first (default sorts first).
const selectedId = ref<number | null>(null)
watch(categories, (list) => {
  if (selectedId.value === null && list.length > 0) selectedId.value = list[0]!.id
  // Keep the selection valid if the selected category was deleted.
  else if (selectedId.value !== null && !list.some(c => c.id === selectedId.value)) {
    selectedId.value = list[0]?.id ?? null
  }
}, { immediate: true })

const selectedCategory = computed(() =>
  categories.value.find(c => c.id === selectedId.value) ?? null,
)
const selectedRates = computed<TaxRateResponse[]>(() =>
  [...(selectedCategory.value?.rates ?? [])].sort((a, b) =>
    a.country_code.localeCompare(b.country_code) || b.valid_from.localeCompare(a.valid_from),
  ),
)

function categoryName(c: TaxCategoryResponse): string {
  return c.name_pl && locale.value === 'pl' ? c.name_pl : c.name
}

function homeRate(c: TaxCategoryResponse): string {
  const r = (c.rates ?? []).find(x => x.country_code === TAX_HOME_COUNTRY && x.valid_to == null)
  return r ? `${Number(r.rate_pct)}%` : '—'
}

// --- category modal + delete ------------------------------------------------

const categoryModalOpen = ref(false)
const editingCategory = ref<TaxCategoryResponse | null>(null)

function openCreateCategory() {
  editingCategory.value = null
  categoryModalOpen.value = true
}
function openEditCategory(c: TaxCategoryResponse) {
  editingCategory.value = c
  categoryModalOpen.value = true
}

const deleteCategory = useDeleteTaxCategory()
async function onDeleteCategory(c: TaxCategoryResponse) {
  if (!confirm(t('admin.tax.confirmDeleteCategory', { name: c.name }))) return
  try {
    await deleteCategory.mutateAsync(c.id)
    toast.add({ title: t('admin.tax.flashes.categoryDeleted'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({
      title: parseProblem(err)?.detail ?? t('admin.tax.flashes.deleteError'),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
}

// --- rate modal + delete ----------------------------------------------------

const rateModalOpen = ref(false)
const editingRate = ref<TaxRateResponse | null>(null)

function openCreateRate() {
  editingRate.value = null
  rateModalOpen.value = true
}
function openEditRate(r: TaxRateResponse) {
  editingRate.value = r
  rateModalOpen.value = true
}

const deleteRate = useDeleteTaxRate()
async function onDeleteRate(r: TaxRateResponse) {
  if (!confirm(t('admin.tax.confirmDeleteRate', { country: r.country_code }))) return
  try {
    await deleteRate.mutateAsync(r.id)
    toast.add({ title: t('admin.tax.flashes.rateDeleted'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({
      title: parseProblem(err)?.detail ?? t('admin.tax.flashes.deleteError'),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
}

/**
 * Nuxt UI calls `onSelect(event, row)` — the EVENT is the first argument.
 * Binding it as `(row) => selectedId = row.original.id` made every click throw
 * `Cannot read properties of undefined (reading 'id')` *inside* the handler, so
 * the selection never moved: the rates table stayed pinned to whichever
 * category sorted first, and no other category's rates could be viewed, added,
 * edited or deleted from the UI.
 */
function onSelectCategory(_event: Event, row: { original: TaxCategoryResponse }) {
  selectedId.value = row.original.id
}

const categoryColumns: TableColumn<TaxCategoryResponse>[] = [
  { accessorKey: 'name', header: () => t('admin.tax.category.fields.name') },
  { accessorKey: 'code', header: () => t('admin.tax.category.fields.code') },
  { id: 'homeRate', header: () => t('admin.tax.category.homeRate', { country: TAX_HOME_COUNTRY }) },
  { id: 'actions', header: '' },
]

const rateColumns: TableColumn<TaxRateResponse>[] = [
  { accessorKey: 'country_code', header: () => t('admin.tax.rate.fields.country') },
  { accessorKey: 'rate_pct', header: () => t('admin.tax.rate.fields.ratePct') },
  { accessorKey: 'valid_from', header: () => t('admin.tax.rate.fields.validFrom') },
  { accessorKey: 'valid_to', header: () => t('admin.tax.rate.fields.validTo') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.tax.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.tax.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          data-testid="tax-category-create"
          @click="openCreateCategory"
        >
          {{ $t('admin.tax.actions.createCategory') }}
        </UButton>
      </header>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <div
        v-if="categories.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.tax.empty') }}
      </div>

      <template v-else>
        <section class="space-y-3">
          <h2 class="text-lg font-semibold">
            {{ $t('admin.tax.category.sectionTitle') }}
          </h2>
          <UTable
            :data="categories"
            :columns="categoryColumns"
            :ui="{ td: 'align-middle', tr: 'cursor-pointer' }"
            @select="onSelectCategory"
          >
            <template #name-cell="{ row }">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="font-medium text-primary text-left"
                  @click.stop="openEditCategory(row.original)"
                >
                  {{ categoryName(row.original) }}
                </button>
                <UBadge
                  v-if="row.original.is_default"
                  color="primary"
                  variant="subtle"
                  size="sm"
                >
                  {{ $t('admin.tax.category.defaultBadge') }}
                </UBadge>
                <UBadge
                  v-if="row.original.id === selectedId"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  {{ $t('admin.tax.category.viewingBadge') }}
                </UBadge>
              </div>
            </template>
            <template #code-cell="{ row }">
              <code class="text-xs text-muted">{{ row.original.code }}</code>
            </template>
            <template #homeRate-cell="{ row }">
              {{ homeRate(row.original) }}
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  size="sm"
                  :aria-label="$t('admin.tax.actions.editCategory')"
                  @click.stop="openEditCategory(row.original)"
                />
                <UButton
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  size="sm"
                  :aria-label="$t('admin.tax.actions.deleteCategory')"
                  @click.stop="onDeleteCategory(row.original)"
                />
              </div>
            </template>
          </UTable>
        </section>

        <section
          v-if="selectedCategory"
          class="space-y-3"
        >
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <h2 class="text-lg font-semibold">
              {{ $t('admin.tax.rate.sectionTitle', { name: categoryName(selectedCategory) }) }}
            </h2>
            <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-plus"
              size="sm"
              data-testid="tax-rate-create"
              @click="openCreateRate"
            >
              {{ $t('admin.tax.actions.createRate') }}
            </UButton>
          </div>

          <p class="text-muted text-sm">
            {{ $t('admin.tax.rate.help') }}
          </p>

          <div
            v-if="selectedRates.length === 0"
            class="text-muted text-sm py-8 text-center border border-default rounded-lg"
          >
            {{ $t('admin.tax.rate.empty') }}
          </div>

          <UTable
            v-else
            :data="selectedRates"
            :columns="rateColumns"
            :ui="{ td: 'align-middle' }"
          >
            <template #rate_pct-cell="{ row }">
              {{ Number(row.original.rate_pct) }}%
            </template>
            <template #valid_to-cell="{ row }">
              {{ row.original.valid_to ?? $t('admin.tax.rate.inForce') }}
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  size="sm"
                  :aria-label="$t('admin.tax.actions.editRate')"
                  @click="openEditRate(row.original)"
                />
                <UButton
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  size="sm"
                  :aria-label="$t('admin.tax.actions.deleteRate')"
                  @click="onDeleteRate(row.original)"
                />
              </div>
            </template>
          </UTable>
        </section>
      </template>

      <AdminTaxCategoryFormModal
        v-model:open="categoryModalOpen"
        :category="editingCategory"
      />
      <AdminTaxRateFormModal
        v-model:open="rateModalOpen"
        :rate="editingRate"
        :category-id="selectedId"
      />
    </div>
  </NuxtLayout>
</template>
