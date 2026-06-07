<script setup lang="ts">
/**
 * Variant rows editor for the product variants matrix (variants F1).
 *
 * Rows are the cartesian product of the option drafts (only options with a
 * name and at least one value count). Existing rows are matched by their
 * option-value combination and keep their id/SKU/prices/stock; new
 * combinations get a blank row. Per row: combination label, SKU, three
 * per-currency price overrides (blank = inherit — the placeholder shows the
 * product's price), initial stock (NEW rows only; existing rows show
 * read-only inventory-owned stock), a gallery image picker, an active
 * toggle, and remove. Removing a row excludes the combination from the save
 * body (the server deletes the variant on the matrix PUT).
 *
 * The matrix owns its rows and emits the assembled `VariantRowDraft[]` on
 * every change via `v-model:rows`; rows above {@link MAX_VARIANTS} trigger a
 * client-side warning mirroring the server cap.
 *
 * Auto-imported as `<AdminProductVariantsMatrix>`.
 */
import {
  comboKey,
  MAX_VARIANTS,
  type OptionDraft,
  type VariantRowDraft,
} from '~/composables/queries/useVariantQueries'
import type { ProductImageResponse } from '#shared/types/api'

const props = defineProps<{
  options: OptionDraft[]
  initialRows: VariantRowDraft[]
  /** Product prices — shown as the inherit placeholders. */
  productPriceUsd?: number | null
  productPricePln?: number | null
  productPriceEur?: number | null
  /** Product gallery for the per-variant image picker. */
  images: ProductImageResponse[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:rows': [value: VariantRowDraft[]]
}>()

const { t } = useI18n()

function cloneRows(rows: VariantRowDraft[]): VariantRowDraft[] {
  return rows.map(row => ({ ...row, optionValues: [...row.optionValues] }))
}

function blankRow(optionValues: string[]): VariantRowDraft {
  return {
    id: null,
    optionValues,
    sku: '',
    priceUsd: null,
    pricePln: null,
    priceEur: null,
    imageId: null,
    isActive: true,
    initialStock: null,
    stock: null,
  }
}

/** Cartesian combinations of the (named, non-empty) option values. */
function buildCombos(options: OptionDraft[]): string[][] {
  const axes = options
    .filter(option => option.name.trim() !== '')
    // Dedupe within an axis — duplicate values would collide row keys (the
    // server rejects them too, at the Pydantic boundary).
    .map(option => [...new Set(option.values.map(v => v.value.trim()).filter(v => v !== ''))])
    .filter(values => values.length > 0)
  if (axes.length === 0) return []
  return axes.reduce<string[][]>(
    (acc, values) => acc.flatMap(combo => values.map(value => [...combo, value])),
    [[]],
  )
}

// Combinations the admin explicitly removed — the cartesian regeneration
// must not resurrect them while the same options stay in place.
const dismissedKeys = ref(new Set<string>())

const rows = ref<VariantRowDraft[]>(cloneRows(props.initialRows))

/** Reconcile the rows against the current cartesian combinations. */
function syncRows() {
  const combos = buildCombos(props.options)
  const comboKeys = new Set(combos.map(comboKey))
  // Forget dismissals for combinations that no longer exist, so re-adding a
  // value later starts fresh.
  for (const key of [...dismissedKeys.value]) {
    if (!comboKeys.has(key)) dismissedKeys.value.delete(key)
  }
  const existingByKey = new Map(rows.value.map(row => [comboKey(row.optionValues), row]))
  rows.value = combos
    .filter(combo => !dismissedKeys.value.has(comboKey(combo)))
    .map(combo => existingByKey.get(comboKey(combo)) ?? blankRow(combo))
}

watch(() => props.options, syncRows, { deep: true })

function emitRows() {
  emit('update:rows', cloneRows(rows.value))
}

watch(rows, emitRows, { deep: true })
onMounted(() => {
  syncRows()
  emitRows()
})

function removeRow(index: number) {
  const row = rows.value[index]
  if (!row) return
  dismissedKeys.value.add(comboKey(row.optionValues))
  rows.value.splice(index, 1)
}

const overCap = computed(() => rows.value.length > MAX_VARIANTS)

const imagePopoverIndex = ref<number | null>(null)

function pickImage(index: number, imageId: number | null) {
  const row = rows.value[index]
  if (row) row.imageId = imageId
  imagePopoverIndex.value = null
}

function imageUrl(imageId: number | null): string | null {
  if (imageId === null) return null
  return props.images.find(image => image.id === imageId)?.url ?? null
}

function comboLabel(row: VariantRowDraft): string {
  return row.optionValues.join(' / ')
}
</script>

<template>
  <div
    class="space-y-3"
    data-testid="product-variants-matrix"
  >
    <UAlert
      v-if="overCap"
      color="warning"
      variant="subtle"
      icon="i-lucide-alert-triangle"
      :title="t('admin.products.variants.matrix.overCapTitle')"
      :description="t('admin.products.variants.matrix.overCap', { max: MAX_VARIANTS, count: rows.length })"
      data-testid="variants-over-cap"
    />

    <p
      v-if="rows.length === 0"
      class="text-muted text-sm py-4 text-center"
      data-testid="variants-empty"
    >
      {{ t('admin.products.variants.matrix.empty') }}
    </p>

    <div
      v-else
      class="overflow-x-auto"
    >
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted border-b border-default">
            <th class="py-2 pe-3 font-medium">
              {{ t('admin.products.variants.matrix.combination') }}
            </th>
            <th class="py-2 pe-3 font-medium">
              {{ t('admin.products.fields.sku') }}
            </th>
            <th class="py-2 pe-3 font-medium">
              {{ t('admin.products.fields.priceUsd') }}
            </th>
            <th class="py-2 pe-3 font-medium">
              {{ t('admin.products.fields.pricePln') }}
            </th>
            <th class="py-2 pe-3 font-medium">
              {{ t('admin.products.fields.priceEur') }}
            </th>
            <th class="py-2 pe-3 font-medium">
              {{ t('admin.products.fields.stock') }}
            </th>
            <th class="py-2 pe-3 font-medium">
              {{ t('admin.products.variants.matrix.image') }}
            </th>
            <th class="py-2 pe-3 font-medium">
              {{ t('admin.products.fields.isActive') }}
            </th>
            <th class="py-2">
              <span class="sr-only">{{ t('admin.products.variants.matrix.removeRow') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in rows"
            :key="comboKey(row.optionValues)"
            class="border-b border-default align-middle"
            :data-testid="`variant-row-${index}`"
          >
            <td class="py-2 pe-3 font-medium whitespace-nowrap">
              {{ comboLabel(row) }}
              <UBadge
                v-if="row.id === null"
                color="info"
                variant="subtle"
                size="sm"
                class="ms-1"
              >
                {{ t('admin.products.variants.matrix.newBadge') }}
              </UBadge>
            </td>
            <td class="py-2 pe-3">
              <UInput
                v-model="row.sku"
                size="sm"
                class="w-32"
                :disabled="disabled"
                :aria-label="t('admin.products.fields.sku')"
                :data-testid="`variant-row-${index}-sku`"
              />
            </td>
            <td class="py-2 pe-3">
              <UInputNumber
                :model-value="row.priceUsd ?? undefined"
                :min="0.01"
                :step="0.01"
                size="sm"
                class="w-28"
                :disabled="disabled"
                :placeholder="productPriceUsd != null ? String(productPriceUsd) : t('admin.products.variants.matrix.inherit')"
                :aria-label="t('admin.products.fields.priceUsd')"
                :data-testid="`variant-row-${index}-price-usd`"
                @update:model-value="(v: number | undefined | null) => { row.priceUsd = v ?? null }"
              />
            </td>
            <td class="py-2 pe-3">
              <UInputNumber
                :model-value="row.pricePln ?? undefined"
                :min="0.01"
                :step="0.01"
                size="sm"
                class="w-28"
                :disabled="disabled"
                :placeholder="productPricePln != null ? String(productPricePln) : t('admin.products.variants.matrix.inherit')"
                :aria-label="t('admin.products.fields.pricePln')"
                :data-testid="`variant-row-${index}-price-pln`"
                @update:model-value="(v: number | undefined | null) => { row.pricePln = v ?? null }"
              />
            </td>
            <td class="py-2 pe-3">
              <UInputNumber
                :model-value="row.priceEur ?? undefined"
                :min="0.01"
                :step="0.01"
                size="sm"
                class="w-28"
                :disabled="disabled"
                :placeholder="productPriceEur != null ? String(productPriceEur) : t('admin.products.variants.matrix.inherit')"
                :aria-label="t('admin.products.fields.priceEur')"
                :data-testid="`variant-row-${index}-price-eur`"
                @update:model-value="(v: number | undefined | null) => { row.priceEur = v ?? null }"
              />
            </td>
            <td class="py-2 pe-3">
              <UInputNumber
                v-if="row.id === null"
                :model-value="row.initialStock ?? undefined"
                :min="0"
                :step="1"
                size="sm"
                class="w-24"
                :disabled="disabled"
                :placeholder="'0'"
                :aria-label="t('admin.products.variants.matrix.initialStock')"
                :data-testid="`variant-row-${index}-initial-stock`"
                @update:model-value="(v: number | undefined | null) => { row.initialStock = v ?? null }"
              />
              <span
                v-else
                class="font-mono"
                :title="t('admin.products.variants.matrix.stockViaInventory')"
                :data-testid="`variant-row-${index}-stock`"
              >
                {{ row.stock }}
              </span>
            </td>
            <td class="py-2 pe-3">
              <UPopover
                :open="imagePopoverIndex === index"
                @update:open="(v: boolean) => { imagePopoverIndex = v ? index : null }"
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :disabled="disabled"
                  :aria-label="t('admin.products.variants.matrix.pickImage')"
                  :data-testid="`variant-row-${index}-image`"
                >
                  <img
                    v-if="imageUrl(row.imageId)"
                    :src="imageUrl(row.imageId)!"
                    alt=""
                    class="w-6 h-6 object-cover rounded"
                  >
                  <UIcon
                    v-else
                    name="i-lucide-image"
                    class="w-4 h-4"
                  />
                </UButton>
                <template #content>
                  <div class="p-3 space-y-2 max-w-xs">
                    <div class="text-xs font-medium">
                      {{ t('admin.products.variants.matrix.pickImage') }}
                    </div>
                    <p
                      v-if="images.length === 0"
                      class="text-xs text-muted"
                    >
                      {{ t('admin.products.variants.matrix.noImages') }}
                    </p>
                    <div
                      v-else
                      class="grid grid-cols-4 gap-2"
                    >
                      <button
                        v-for="image in images"
                        :key="image.id"
                        type="button"
                        class="border rounded p-0.5"
                        :class="row.imageId === image.id ? 'border-primary ring-1 ring-primary' : 'border-default'"
                        :aria-label="image.alt_text ?? t('admin.products.variants.matrix.pickImage')"
                        :data-testid="`variant-row-${index}-image-${image.id}`"
                        @click="pickImage(index, image.id)"
                      >
                        <img
                          :src="image.url"
                          :alt="image.alt_text ?? ''"
                          class="w-12 h-12 object-cover rounded"
                        >
                      </button>
                    </div>
                    <UButton
                      v-if="row.imageId !== null"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      block
                      :data-testid="`variant-row-${index}-image-clear`"
                      @click="pickImage(index, null)"
                    >
                      {{ t('admin.products.variants.matrix.clearImage') }}
                    </UButton>
                  </div>
                </template>
              </UPopover>
            </td>
            <td class="py-2 pe-3">
              <USwitch
                v-model="row.isActive"
                size="sm"
                :disabled="disabled"
                :aria-label="t('admin.products.fields.isActive')"
                :data-testid="`variant-row-${index}-active`"
              />
            </td>
            <td class="py-2">
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                size="sm"
                :disabled="disabled"
                :aria-label="t('admin.products.variants.matrix.removeRow')"
                :data-testid="`variant-row-${index}-remove`"
                @click="removeRow(index)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
