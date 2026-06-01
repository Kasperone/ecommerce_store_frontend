<script setup lang="ts">
import { z } from 'zod'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { StoreConfig, StoreConfigUpdate } from '~/composables/queries/useSettingsQueries'
import type { ProblemDetails } from '#shared/utils/problemDetails'

const props = defineProps<{
  /** The loaded store-config singleton; null while the GET is in flight. */
  config?: StoreConfig | null
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  submit: [value: StoreConfigUpdate]
}>()

const { t } = useI18n()

interface FormState {
  store_name: string
  address_line: string
  postal_city: string
  country: string
  tax_id: string
  email: string
  invoice_vat_rate: number | undefined
}

const state = reactive<FormState>({
  store_name: '',
  address_line: '',
  postal_city: '',
  country: '',
  tax_id: '',
  email: '',
  invoice_vat_rate: undefined,
})

watch(
  () => props.config,
  (config) => {
    if (!config) return
    state.store_name = config.store_name
    state.address_line = config.address_line
    state.postal_city = config.postal_city
    state.country = config.country
    state.tax_id = config.tax_id
    state.email = config.email
    state.invoice_vat_rate = config.invoice_vat_rate
  },
  // immediate so a config already resolved at mount prefills the fields.
  { immediate: true },
)

// Client-side guard mirroring the backend CHECK (invoice_vat_rate 0–100). The
// backend also 422s out-of-range values; those surface via <ErrorAlert>.
const schema = computed(() =>
  z.object({
    store_name: z.string().min(1, t('admin.settings.errors.required')),
    address_line: z.string().min(1, t('admin.settings.errors.required')),
    postal_city: z.string().min(1, t('admin.settings.errors.required')),
    country: z.string().min(1, t('admin.settings.errors.required')),
    tax_id: z.string().min(1, t('admin.settings.errors.required')),
    email: z.string().email(t('admin.settings.errors.email')),
    invoice_vat_rate: z
      .number({ message: t('admin.settings.errors.vatRange') })
      .min(0, t('admin.settings.errors.vatRange'))
      .max(100, t('admin.settings.errors.vatRange')),
  }),
)

function validate(values: FormState): FormError[] {
  const result = schema.value.safeParse({
    ...values,
    invoice_vat_rate: values.invoice_vat_rate ?? null,
  })
  if (result.success) return []
  return result.error.issues.map(issue => ({
    name: String(issue.path[0] ?? ''),
    message: issue.message,
  }))
}

function onSubmit(_event: FormSubmitEvent<FormState>) {
  const patch: StoreConfigUpdate = {
    store_name: state.store_name.trim(),
    address_line: state.address_line.trim(),
    postal_city: state.postal_city.trim(),
    country: state.country.trim(),
    tax_id: state.tax_id.trim(),
    email: state.email.trim(),
    invoice_vat_rate: state.invoice_vat_rate ?? undefined,
  }
  emit('submit', patch)
}
</script>

<template>
  <UForm
    :state="state"
    :validate="validate"
    :validate-on="['submit']"
    class="space-y-8"
    @submit="onSubmit"
  >
    <ErrorAlert
      v-if="error"
      :problem="error"
    />

    <section class="space-y-4">
      <h2 class="text-lg font-semibold">
        {{ t('admin.settings.sections.identity') }}
      </h2>

      <UFormField
        :label="t('admin.settings.fields.storeName')"
        name="store_name"
        required
      >
        <UInput
          v-model="state.store_name"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.email')"
        :help="t('admin.settings.hints.email')"
        name="email"
        required
      >
        <UInput
          v-model="state.email"
          type="email"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.addressLine')"
        name="address_line"
        required
      >
        <UInput
          v-model="state.address_line"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField
          :label="t('admin.settings.fields.postalCity')"
          name="postal_city"
          required
        >
          <UInput
            v-model="state.postal_city"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.settings.fields.country')"
          name="country"
          required
        >
          <UInput
            v-model="state.country"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
      </div>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.invoicing') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.invoicing') }}
        </p>
      </div>

      <UFormField
        :label="t('admin.settings.fields.taxId')"
        :help="t('admin.settings.hints.taxId')"
        name="tax_id"
        required
        class="max-w-md"
      >
        <UInput
          v-model="state.tax_id"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.invoiceVatRate')"
        :help="t('admin.settings.hints.invoiceVatRate')"
        name="invoice_vat_rate"
        required
        class="max-w-xs"
      >
        <UInputNumber
          v-model="state.invoice_vat_rate"
          :min="0"
          :max="100"
          :step="0.5"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
    </section>

    <div class="flex justify-end gap-2 pt-4 border-t border-default">
      <UButton
        type="submit"
        color="primary"
        :loading="loading"
      >
        {{ t('admin.settings.actions.save') }}
      </UButton>
    </div>
  </UForm>
</template>
