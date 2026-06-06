<script setup lang="ts">
/**
 * Quote create form: company picker + currency + optional valid-until / notes +
 * the repeatable line-item editor. Validates client-side (a company, at least
 * one non-empty line) mirroring the backend's 404 (unknown company) / 422 (empty
 * items) guards, then emits the assembled `QuoteCreate` body via `@submit`. The
 * parent owns the mutation + error surface so this component stays presentational.
 *
 * Auto-imported as `<AdminQuoteForm>` (pathPrefix prepends `admin/`).
 */
import { useI18n } from 'vue-i18n'
import type {
  CompanyResponse,
  QuoteCreate,
  QuoteCurrency,
  QuoteItemCreate,
} from '~/composables/queries/useQuoteQueries'

const props = defineProps<{
  companies: CompanyResponse[]
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [body: QuoteCreate]
  cancel: []
}>()

const { t } = useI18n()

const CURRENCIES: QuoteCurrency[] = ['USD', 'PLN', 'EUR']

const companyId = ref<number | null>(null)
const currency = ref<QuoteCurrency>('USD')
const validUntil = ref('')
const notes = ref('')
const items = ref<QuoteItemCreate[]>([])
// Synthetic client-side validation message (matches the backend's plain detail
// shape so the parent's <ErrorAlert> renders it identically to a server 422).
const validationError = ref<string | null>(null)

const companyOptions = computed(() =>
  props.companies.map(c => ({ label: c.name, value: c.id })),
)

const currencyOptions = computed(() =>
  CURRENCIES.map(c => ({ label: c, value: c })),
)

function onSubmit() {
  validationError.value = null

  if (companyId.value == null) {
    validationError.value = t('admin.quotes.errors.companyRequired')
    return
  }
  if (items.value.length === 0) {
    validationError.value = t('admin.quotes.errors.itemsRequired')
    return
  }

  const body: QuoteCreate = {
    company_id: companyId.value,
    currency: currency.value,
    valid_until: validUntil.value || null,
    notes: notes.value.trim() || null,
    items: items.value,
  }
  emit('submit', body)
}

// Expose the validation error so the parent can merge it with server errors via
// the shared <ErrorAlert>; defineExpose keeps it readable from a spec too.
defineExpose({ validationError })
</script>

<template>
  <form
    class="space-y-6"
    data-testid="quote-form"
    @submit.prevent="onSubmit"
  >
    <ErrorAlert
      v-if="validationError"
      :problem="{ title: validationError }"
      data-testid="quote-form-validation"
    />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <UFormField
        :label="t('admin.quotes.form.company')"
        name="company_id"
        required
      >
        <USelectMenu
          v-model="companyId"
          :items="companyOptions"
          value-key="value"
          :placeholder="t('admin.quotes.form.companyPlaceholder')"
          class="w-full"
          data-testid="quote-company"
        />
      </UFormField>

      <UFormField
        :label="t('admin.quotes.form.currency')"
        name="currency"
      >
        <USelect
          v-model="currency"
          :items="currencyOptions"
          value-key="value"
          class="w-full sm:w-40"
          data-testid="quote-currency"
        />
      </UFormField>
    </div>

    <UFormField
      :label="t('admin.quotes.form.validUntil')"
      :help="t('admin.quotes.form.validUntilHint')"
      name="valid_until"
    >
      <UInput
        v-model="validUntil"
        type="date"
        class="w-full sm:w-48"
        data-testid="quote-valid-until"
      />
    </UFormField>

    <UFormField
      :label="t('admin.quotes.form.notes')"
      name="notes"
    >
      <UTextarea
        v-model="notes"
        :rows="3"
        class="w-full"
        data-testid="quote-notes"
      />
    </UFormField>

    <div>
      <h3 class="text-sm font-semibold mb-2">
        {{ t('admin.quotes.form.lineItems') }}
      </h3>
      <AdminQuoteLineItemsEditor
        v-model:items="items"
        :currency="currency"
      />
    </div>

    <div class="flex justify-end gap-2">
      <UButton
        color="neutral"
        variant="soft"
        :disabled="loading"
        @click="emit('cancel')"
      >
        {{ t('admin.quotes.form.cancel') }}
      </UButton>
      <UButton
        type="submit"
        color="primary"
        icon="i-lucide-save"
        :loading="loading"
        data-testid="quote-form-submit"
        @click="onSubmit"
      >
        {{ t('admin.quotes.form.create') }}
      </UButton>
    </div>
  </form>
</template>
