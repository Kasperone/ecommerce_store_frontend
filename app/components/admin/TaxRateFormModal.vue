<script setup lang="ts">
import { z } from 'zod'
import type {
  TaxRateCreate,
  TaxRateResponse,
  TaxRateUpdate,
} from '#shared/types/api'

/**
 * Create / edit a per-country tax rate under a category.
 *
 * `rate === null` ⇒ create (POST under `categoryId`); a rate ⇒ edit (PATCH).
 * Validity windows are half-open: `valid_from` inclusive, `valid_to` exclusive
 * (blank = still in force). The category is fixed — move a rate by deleting and
 * recreating it under another category.
 */

const props = defineProps<{
  open: boolean
  rate: TaxRateResponse | null
  categoryId: number | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [rate: TaxRateResponse]
}>()

const { t } = useI18n()
const toast = useToast()

const createRate = useCreateTaxRate()
const updateRate = useUpdateTaxRate()

const state = reactive({
  country_code: '',
  rate_pct: 23 as number,
  valid_from: '',
  valid_to: '',
})
const error = ref<unknown>(null)

const isEdit = computed(() => props.rate !== null)
const loading = computed(() => createRate.isLoading.value || updateRate.isLoading.value)

const schema = computed(() =>
  z.object({
    country_code: z.string().trim().length(2, t('admin.tax.errors.countryFormat')),
    rate_pct: z.number().min(0).max(100),
    valid_from: z.string().min(1, t('admin.tax.errors.validFromRequired')),
    valid_to: z.string(),
  }).superRefine((val, ctx) => {
    if (val.valid_to && val.valid_to <= val.valid_from) {
      ctx.addIssue({ code: 'custom', path: ['valid_to'], message: t('admin.tax.errors.windowOrder') })
    }
  }),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const r = props.rate
    state.country_code = r?.country_code ?? ''
    state.rate_pct = r ? Number(r.rate_pct) : 23
    state.valid_from = r?.valid_from ?? ''
    state.valid_to = r?.valid_to ?? ''
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  error.value = null
  try {
    const body: TaxRateCreate = {
      country_code: state.country_code.trim().toUpperCase(),
      rate_pct: state.rate_pct,
      valid_from: state.valid_from,
      valid_to: state.valid_to || null,
    }
    let saved: TaxRateResponse
    if (props.rate) {
      saved = await updateRate.mutateAsync({ id: props.rate.id, patch: body as TaxRateUpdate })
      toast.add({ title: t('admin.tax.flashes.rateUpdated'), color: 'success', icon: 'i-lucide-check' })
    }
    else {
      if (props.categoryId == null) throw new Error('categoryId required to create a rate')
      saved = await createRate.mutateAsync({ categoryId: props.categoryId, input: body })
      toast.add({ title: t('admin.tax.flashes.rateCreated'), color: 'success', icon: 'i-lucide-check' })
    }
    emit('saved', saved)
    openModel.value = false
  }
  catch (err) {
    error.value = err
  }
}
</script>

<template>
  <AdminFormModal
    :open="openModel"
    :title="isEdit ? t('admin.tax.rate.editTitle') : t('admin.tax.rate.createTitle')"
    :submit-label="t('admin.tax.form.save')"
    :cancel-label="t('admin.tax.form.cancel')"
    :loading="loading"
    :error="error"
    :schema="schema"
    :state="state"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.tax.rate.fields.country')"
          :help="t('admin.tax.rate.countryHint')"
          name="country_code"
          required
        >
          <UInput
            v-model="state.country_code"
            class="w-full sm:w-32"
            :maxlength="2"
            placeholder="PL"
            data-testid="tax-rate-country"
          />
        </UFormField>

        <UFormField
          :label="t('admin.tax.rate.fields.ratePct')"
          name="rate_pct"
          required
        >
          <UInputNumber
            v-model="state.rate_pct"
            :min="0"
            :max="100"
            :step="0.01"
            class="w-full sm:w-40"
            data-testid="tax-rate-pct"
          />
        </UFormField>

        <UFormField
          :label="t('admin.tax.rate.fields.validFrom')"
          name="valid_from"
          required
        >
          <UInput
            v-model="state.valid_from"
            type="date"
            class="w-full sm:w-48"
            data-testid="tax-rate-valid-from"
          />
        </UFormField>

        <UFormField
          :label="t('admin.tax.rate.fields.validTo')"
          :help="t('admin.tax.rate.validToHint')"
          name="valid_to"
        >
          <UInput
            v-model="state.valid_to"
            type="date"
            class="w-full sm:w-48"
            data-testid="tax-rate-valid-to"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
