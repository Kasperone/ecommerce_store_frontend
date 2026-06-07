<script setup lang="ts">
/**
 * Option-axes editor for the product variants matrix (variants F1).
 *
 * Up to {@link MAX_OPTIONS} option rows (e.g. "Color", "Size"), each with an
 * EN name, an optional PL name, and a tag-style list of values (EN required,
 * per-value PL optional). Rows reorder via up/down arrows. The editor owns
 * the rows internally (seeded once from `initial`) and emits the assembled
 * `OptionDraft[]` on every change via `v-model:options` — the QuoteLineItems
 * editor pattern.
 *
 * Auto-imported as `<AdminProductOptionsEditor>`.
 */
import {
  MAX_OPTIONS,
  type OptionDraft,
} from '~/composables/queries/useVariantQueries'

const props = defineProps<{
  initial: OptionDraft[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:options': [value: OptionDraft[]]
}>()

const { t } = useI18n()

function cloneDrafts(drafts: OptionDraft[]): OptionDraft[] {
  return drafts.map(option => ({
    name: option.name,
    namePl: option.namePl,
    values: option.values.map(value => ({ ...value })),
  }))
}

// Seed once from the incoming drafts; subsequent edits flow out via the emit.
const rows = ref<OptionDraft[]>(cloneDrafts(props.initial))

function emitOptions() {
  emit('update:options', cloneDrafts(rows.value))
}

watch(rows, emitOptions, { deep: true })
onMounted(emitOptions)

const canAddOption = computed(() => rows.value.length < MAX_OPTIONS)

function addOption() {
  if (!canAddOption.value) return
  rows.value.push({ name: '', namePl: '', values: [{ value: '', valuePl: '' }] })
}

function removeOption(index: number) {
  rows.value.splice(index, 1)
}

function moveOption(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= rows.value.length) return
  const [moved] = rows.value.splice(index, 1)
  rows.value.splice(target, 0, moved!)
}

function addValue(optionIndex: number) {
  rows.value[optionIndex]!.values.push({ value: '', valuePl: '' })
}

function removeValue(optionIndex: number, valueIndex: number) {
  const option = rows.value[optionIndex]!
  option.values.splice(valueIndex, 1)
  // Never leave an option with zero value inputs — keep one blank.
  if (option.values.length === 0) option.values.push({ value: '', valuePl: '' })
}
</script>

<template>
  <div
    class="space-y-3"
    data-testid="product-options-editor"
  >
    <div
      v-for="(option, optionIndex) in rows"
      :key="optionIndex"
      class="rounded-md border border-default bg-elevated p-3 space-y-3"
      :data-testid="`product-option-${optionIndex}`"
    >
      <div class="flex flex-wrap items-end gap-3">
        <UFormField
          :label="t('admin.products.variants.options.name')"
          required
          class="min-w-40"
        >
          <UInput
            v-model="option.name"
            :placeholder="t('admin.products.variants.options.namePlaceholder')"
            :disabled="disabled"
            :data-testid="`product-option-${optionIndex}-name`"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.variants.options.namePl')"
          class="min-w-40"
        >
          <UInput
            v-model="option.namePl"
            :placeholder="t('admin.products.variants.options.namePlPlaceholder')"
            :disabled="disabled"
            :data-testid="`product-option-${optionIndex}-name-pl`"
          />
        </UFormField>
        <div class="ms-auto flex items-center gap-1">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-up"
            size="sm"
            :disabled="disabled || optionIndex === 0"
            :aria-label="t('admin.products.variants.options.moveUp')"
            :data-testid="`product-option-${optionIndex}-up`"
            @click="moveOption(optionIndex, -1)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-down"
            size="sm"
            :disabled="disabled || optionIndex === rows.length - 1"
            :aria-label="t('admin.products.variants.options.moveDown')"
            :data-testid="`product-option-${optionIndex}-down`"
            @click="moveOption(optionIndex, 1)"
          />
          <UButton
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            size="sm"
            :disabled="disabled"
            :aria-label="t('admin.products.variants.options.remove')"
            :data-testid="`product-option-${optionIndex}-remove`"
            @click="removeOption(optionIndex)"
          />
        </div>
      </div>

      <div class="space-y-2">
        <div class="text-xs font-medium text-muted">
          {{ t('admin.products.variants.options.values') }}
          <span
            class="text-error"
            aria-hidden="true"
          >*</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="(value, valueIndex) in option.values"
            :key="valueIndex"
            class="flex items-center gap-1 rounded-md border border-default bg-default px-2 py-1"
            :data-testid="`product-option-${optionIndex}-value-${valueIndex}`"
          >
            <UInput
              v-model="value.value"
              size="xs"
              :placeholder="t('admin.products.variants.options.valuePlaceholder')"
              :aria-label="t('admin.products.variants.options.value')"
              :disabled="disabled"
              class="w-24"
              :data-testid="`product-option-${optionIndex}-value-${valueIndex}-en`"
            />
            <UInput
              v-model="value.valuePl"
              size="xs"
              :placeholder="t('admin.products.variants.options.valuePlPlaceholder')"
              :aria-label="t('admin.products.variants.options.valuePl')"
              :disabled="disabled"
              class="w-24"
              :data-testid="`product-option-${optionIndex}-value-${valueIndex}-pl`"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="xs"
              :disabled="disabled"
              :aria-label="t('admin.products.variants.options.removeValue')"
              :data-testid="`product-option-${optionIndex}-value-${valueIndex}-remove`"
              @click="removeValue(optionIndex, valueIndex)"
            />
          </div>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-plus"
            size="xs"
            :disabled="disabled"
            :data-testid="`product-option-${optionIndex}-add-value`"
            @click="addValue(optionIndex)"
          >
            {{ t('admin.products.variants.options.addValue') }}
          </UButton>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        size="sm"
        :disabled="disabled || !canAddOption"
        data-testid="product-options-add"
        @click="addOption"
      >
        {{ t('admin.products.variants.options.add') }}
      </UButton>
      <span
        v-if="!canAddOption"
        class="text-xs text-muted"
        data-testid="product-options-cap-hint"
      >
        {{ t('admin.products.variants.options.maxReached', { max: MAX_OPTIONS }) }}
      </span>
    </div>
  </div>
</template>
