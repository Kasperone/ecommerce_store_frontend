<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import type { ProductBulkSet } from '#shared/types/api'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

/**
 * Bulk-edit toolbar — shown when ≥1 product row is selected on the admin list.
 * Sends only the fields the admin actually filled to `PATCH /admin/products/bulk`.
 * Stock is intentionally NOT offered (the backend rejects it; stock flows through
 * the inventory ledger). On success the parent refetches + clears selection;
 * 404 (missing ids) / 422 (validation) surface via the validated-form flow.
 */

const props = defineProps<{ productIds: number[] }>()
const emit = defineEmits<{ applied: [] }>()

const { t } = useI18n()
const toast = useToast()

// All fields optional — a bulk-edit writes only what's set. Empty strings from
// number inputs become `undefined` so they're omitted from the payload.
const numberField = z
  .number({ message: t('admin.products.bulk.errors.price') })
  .nonnegative({ message: t('admin.products.bulk.errors.price') })
  .optional()

const schema = z.object({
  price_usd: numberField,
  price_pln: numberField,
  price_eur: numberField,
  is_active: z.enum(['unset', 'true', 'false']),
  low_stock_threshold: z.number().int().nonnegative().nullable().optional(),
})

// Declare state BEFORE useValidatedForm (TDZ — the error-clearing watch reads it
// once at setup).
const state = reactive<{
  price_usd?: number
  price_pln?: number
  price_eur?: number
  is_active: 'unset' | 'true' | 'false'
  low_stock_threshold?: number | null
}>({
  price_usd: undefined,
  price_pln: undefined,
  price_eur: undefined,
  is_active: 'unset',
  low_stock_threshold: undefined,
})

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'admin.products.bulk.errorTitle',
})

const { mutateAsync, isLoading } = useBulkUpdateProducts()

const isActiveOptions = computed(() => [
  { label: t('admin.products.bulk.isActive.unset'), value: 'unset' },
  { label: t('admin.products.bulk.isActive.true'), value: 'true' },
  { label: t('admin.products.bulk.isActive.false'), value: 'false' },
])

// `low_stock_threshold` can be cleared to null explicitly (= never flagged).
const thresholdMode = ref<'unset' | 'set' | 'clear'>('unset')

// Build the `set` payload from only the touched fields.
const builtSet = computed<ProductBulkSet>(() => {
  const set: ProductBulkSet = {}
  if (state.price_usd !== undefined) set.price_usd = state.price_usd
  if (state.price_pln !== undefined) set.price_pln = state.price_pln
  if (state.price_eur !== undefined) set.price_eur = state.price_eur
  if (state.is_active !== 'unset') set.is_active = state.is_active === 'true'
  if (thresholdMode.value === 'clear') set.low_stock_threshold = null
  else if (thresholdMode.value === 'set' && state.low_stock_threshold != null) {
    set.low_stock_threshold = state.low_stock_threshold
  }
  return set
})

const hasChanges = computed(() => Object.keys(builtSet.value).length > 0)

function resetForm() {
  state.price_usd = undefined
  state.price_pln = undefined
  state.price_eur = undefined
  state.is_active = 'unset'
  state.low_stock_threshold = undefined
  thresholdMode.value = 'unset'
  errorMessage.value = ''
}

async function onApply() {
  if (!hasChanges.value || props.productIds.length === 0) return
  errorMessage.value = ''
  try {
    const result = await mutateAsync({ productIds: props.productIds, set: builtSet.value })
    toast.add({
      title: t('admin.products.bulk.applied', { count: result.updated }),
      color: 'success',
      icon: 'i-lucide-check',
    })
    resetForm()
    emit('applied')
  }
  catch (err) {
    applyApiError(err, t('admin.products.bulk.errorTitle'))
  }
}
</script>

<template>
  <div
    class="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/60
    dark:bg-primary-950/40 p-4 space-y-3"
  >
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <p class="font-medium text-sm">
        {{ t('admin.products.bulk.selected', { count: productIds.length }) }}
      </p>
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-x"
        @click="emit('applied')"
      >
        {{ t('admin.products.bulk.clearSelection') }}
      </UButton>
    </div>

    <UForm
      ref="formRef"
      :schema="schema"
      :state="state"
      :validate-on="['submit']"
      class="space-y-3"
      @submit="onApply"
    >
      <UAlert
        v-if="errorMessage"
        role="alert"
        color="error"
        variant="soft"
        :title="t('admin.products.bulk.errorTitle')"
        :description="errorMessage"
        :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
        @close="errorMessage = ''"
      />

      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <UFormField
          :label="t('admin.products.bulk.fields.priceUsd')"
          name="price_usd"
        >
          <UInput
            v-model.number="state.price_usd"
            type="number"
            step="0.01"
            min="0"
            :placeholder="t('admin.products.bulk.unchanged')"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.bulk.fields.pricePln')"
          name="price_pln"
        >
          <UInput
            v-model.number="state.price_pln"
            type="number"
            step="0.01"
            min="0"
            :placeholder="t('admin.products.bulk.unchanged')"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.bulk.fields.priceEur')"
          name="price_eur"
        >
          <UInput
            v-model.number="state.price_eur"
            type="number"
            step="0.01"
            min="0"
            :placeholder="t('admin.products.bulk.unchanged')"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.bulk.fields.isActive')"
          name="is_active"
        >
          <USelect
            v-model="state.is_active"
            :items="isActiveOptions"
            value-key="value"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.bulk.fields.lowStockThreshold')"
          name="low_stock_threshold"
          class="col-span-2"
        >
          <div class="flex gap-2">
            <USelect
              v-model="thresholdMode"
              :items="[
                { label: t('admin.products.bulk.threshold.unset'), value: 'unset' },
                { label: t('admin.products.bulk.threshold.set'), value: 'set' },
                { label: t('admin.products.bulk.threshold.clear'), value: 'clear' },
              ]"
              value-key="value"
              class="w-40"
            />
            <UInput
              v-if="thresholdMode === 'set'"
              v-model.number="state.low_stock_threshold"
              type="number"
              min="0"
              step="1"
              class="flex-1"
              :placeholder="t('admin.products.bulk.fields.lowStockThreshold')"
            />
          </div>
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton
          type="submit"
          color="primary"
          icon="i-lucide-check-check"
          :loading="isLoading"
          :disabled="!hasChanges || isLoading"
        >
          {{ t('admin.products.bulk.applyButton', { count: productIds.length }) }}
        </UButton>
      </div>
    </UForm>
  </div>
</template>
