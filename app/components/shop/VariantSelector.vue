<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ProductOptionResponse,
  ProductOptionValueResponse,
  ProductVariantPublic,
} from '#shared/types/api'

/**
 * PDP option pills (variants F2). One button group per product option
 * ("Color", "Size", …); the shopper picks one value per option and the
 * selector resolves the matching variant into `v-model` (null until every
 * option has a selection).
 *
 * Combination logic against the ACTIVE variants the public API returns:
 * - a value is **disabled** when no variant exists with that value plus the
 *   currently selected values of the other options;
 * - a value is **out-of-stock styled** (strikethrough, still selectable) when
 *   matching variants exist but every one is out of stock and the product
 *   doesn't allow backorder.
 *
 * Option/value labels fall back like `localizedProductName` (PL → `*_pl`
 * when set, else the EN field). Auto-imported as `<ShopVariantSelector>`.
 */
const props = defineProps<{
  options: ProductOptionResponse[]
  variants: ProductVariantPublic[]
  allowBackorder?: boolean
}>()

const model = defineModel<ProductVariantPublic | null>({ default: null })

const { locale } = useI18n()

const sortedOptions = computed(() =>
  [...props.options].sort((a, b) => a.position - b.position),
)

function sortedValues(option: ProductOptionResponse): ProductOptionValueResponse[] {
  return [...(option.values ?? [])].sort((a, b) => a.position - b.position)
}

function optionLabel(option: ProductOptionResponse): string {
  if (locale.value === 'pl' && option.name_pl) return option.name_pl
  return option.name
}

function valueLabel(value: ProductOptionValueResponse): string {
  if (locale.value === 'pl' && value.value_pl) return value.value_pl
  return value.value
}

// Selected value id per option id; null = nothing picked for that axis yet.
const selected = reactive(new Map<number, number | null>())
watch(
  () => props.options,
  (options) => {
    selected.clear()
    for (const option of options) selected.set(option.id, null)
  },
  { immediate: true },
)

/** Active variants carrying `valueId` plus the selected values of the OTHER options. */
function candidatesFor(optionId: number, valueId: number): ProductVariantPublic[] {
  const otherSelected = sortedOptions.value
    .filter(option => option.id !== optionId)
    .map(option => selected.get(option.id))
    .filter((id): id is number => id != null)
  return props.variants.filter(variant =>
    (variant.option_value_ids ?? []).includes(valueId)
    && otherSelected.every(id => (variant.option_value_ids ?? []).includes(id)),
  )
}

function isDisabled(optionId: number, valueId: number): boolean {
  return candidatesFor(optionId, valueId).length === 0
}

function isOutOfStock(optionId: number, valueId: number): boolean {
  if (props.allowBackorder) return false
  const candidates = candidatesFor(optionId, valueId)
  return candidates.length > 0 && candidates.every(variant => !variant.in_stock)
}

function select(optionId: number, valueId: number) {
  selected.set(optionId, selected.get(optionId) === valueId ? null : valueId)
}

// The resolved variant once every option has a selection (exactly one value
// per option per the backend's matrix invariant).
const resolved = computed<ProductVariantPublic | null>(() => {
  const ids = sortedOptions.value.map(option => selected.get(option.id))
  if (ids.length === 0 || ids.some(id => id == null)) return null
  return (
    props.variants.find(variant =>
      ids.every(id => (variant.option_value_ids ?? []).includes(id!)),
    ) ?? null
  )
})

watch(resolved, (variant) => {
  model.value = variant
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <fieldset
      v-for="option in sortedOptions"
      :key="option.id"
    >
      <legend class="mb-2 text-sm font-medium">
        {{ optionLabel(option) }}
      </legend>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="value in sortedValues(option)"
          :key="value.id"
          size="sm"
          :color="selected.get(option.id) === value.id ? 'primary' : 'neutral'"
          :variant="selected.get(option.id) === value.id ? 'solid' : 'outline'"
          :disabled="isDisabled(option.id, value.id)"
          :class="isOutOfStock(option.id, value.id) ? 'line-through opacity-60' : undefined"
          :aria-pressed="selected.get(option.id) === value.id"
          :data-testid="`variant-value-${value.id}`"
          @click="select(option.id, value.id)"
        >
          {{ valueLabel(value) }}
        </UButton>
      </div>
    </fieldset>
  </div>
</template>
