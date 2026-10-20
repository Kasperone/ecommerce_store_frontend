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
import { z } from 'zod'
import type {
  CompanyResponse,
  QuoteCreate,
  QuoteCurrency,
  QuoteItemCreate,
} from '~/composables/queries/useQuoteQueries'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

const props = defineProps<{
  companies: CompanyResponse[]
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
}>()

const emit = defineEmits<{
  submit: [body: QuoteCreate]
  cancel: []
}>()

const { t } = useI18n()
const toast = useToast()

const CURRENCIES: QuoteCurrency[] = ['USD', 'PLN', 'EUR']

const state = reactive({
  company_id: null as number | null,
  currency: 'USD' as QuoteCurrency,
  valid_until: '',
  notes: '',
  items: [] as QuoteItemCreate[],
})

const schema = computed(() =>
  z.object({
    company_id: z.number({ message: t('admin.quotes.errors.companyRequired') }),
    currency: z.enum(['USD', 'PLN', 'EUR']),
    valid_until: z.string(),
    notes: z.string(),
    items: z.array(z.unknown()).min(1, t('admin.quotes.errors.itemsRequired')),
  }),
)

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

// The page owns the create mutation; surface its raw error here so the form
// drives the same flow as signin (message + backend field mapping).
watch(
  () => props.error,
  (err) => {
    if (err) applyApiError(err, t('messages.saveError'))
    else errorMessage.value = ''
  },
)

const companyOptions = computed(() =>
  props.companies.map(c => ({ label: c.name, value: c.id })),
)

const currencyOptions = computed(() =>
  CURRENCIES.map(c => ({ label: c, value: c })),
)

function onSubmit() {
  const body: QuoteCreate = {
    company_id: state.company_id!,
    currency: state.currency,
    valid_until: state.valid_until || null,
    notes: state.notes.trim() || null,
    items: state.items,
  }
  emit('submit', body)
}

// Exposed so component/page tests can seed the non-native pickers + line items.
defineExpose({ state })
</script>

<template>
  <UForm
    ref="formRef"
    :schema="schema"
    :state="state"
    :validate-on="[]"
    class="space-y-6"
    data-testid="quote-form"
    @submit="onSubmit"
  >
    <UAlert
      v-if="errorMessage"
      role="alert"
      color="error"
      variant="soft"
      :title="t('messages.saveErrorTitle')"
      :description="errorMessage"
      :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
      data-testid="quote-form-validation"
      @close="errorMessage = ''"
    />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <UFormField
        :label="t('admin.quotes.form.company')"
        name="company_id"
        required
      >
        <USelectMenu
          v-model="state.company_id"
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
          v-model="state.currency"
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
        v-model="state.valid_until"
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
        v-model="state.notes"
        :rows="3"
        class="w-full"
        data-testid="quote-notes"
      />
    </UFormField>

    <UFormField
      :label="t('admin.quotes.form.lineItems')"
      name="items"
      :ui="{ label: 'text-sm font-semibold' }"
    >
      <AdminQuoteLineItemsEditor
        v-model:items="state.items"
        :currency="state.currency"
      />
    </UFormField>

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
      >
        {{ t('admin.quotes.form.create') }}
      </UButton>
    </div>
  </UForm>
</template>
