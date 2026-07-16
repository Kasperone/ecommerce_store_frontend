<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { z } from 'zod'
import type {
  CompanyCreate,
  CompanyResponse,
  CompanyStatus,
  CompanyUpdate,
} from '~/composables/queries/useCompanyQueries'

/**
 * Create / edit a B2B company.
 *
 * `company === null` ⇒ create (POST); a company ⇒ edit (PATCH, the whole
 * validated body — the backend only applies the fields it receives). Client-side
 * validation is light (name required); anything else (e.g. duplicate tax id)
 * surfaces from the server as a `ProblemDetails` through `<AdminFormModal :error>`,
 * rendering identically to the synthetic name-required error.
 */

const props = defineProps<{
  open: boolean
  // null = create; a company = edit.
  company: CompanyResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const createCompany = useCreateCompany()
const updateCompany = useUpdateCompany()

const STATUSES: CompanyStatus[] = ['pending', 'approved', 'rejected']

const state = reactive({
  name: '',
  tax_id: '',
  email: '',
  phone: '',
  status: 'pending' as CompanyStatus,
  account_manager: '',
  notes: '',
})
const error = ref<unknown>(null)

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('admin.companies.errors.nameRequired')),
    tax_id: z.string(),
    email: z.string(),
    phone: z.string(),
    status: z.enum(STATUSES as [CompanyStatus, ...CompanyStatus[]]),
    account_manager: z.string(),
    notes: z.string(),
  }),
)

// Primary contact: the company's designated customer. Picking one binds its id to
// `primary_user_id`; the converted order (QC) is owned by this real customer. The
// picker searches the EXISTING `GET /admin/customers?search=` remotely (no new
// lookup endpoint). Nullable — clearing it sends `primary_user_id: null`.
const primaryUserId = ref<number | null>(null)
// The current contact's email, shown alongside the picker even before any search
// runs (the selected user may not be in the latest search page). Seeded from the
// loaded company's denormalised `primary_user_email`.
const primaryContactEmail = ref<string | null>(null)
const contactSearch = ref('')
const { data: customerPage } = useCustomersQuery(() => ({
  search: contactSearch.value || undefined,
  pageSize: 20,
}))

interface ContactOption { label: string, value: number }
const contactOptions = computed<ContactOption[]>(() => {
  const rows = customerPage.value?.items ?? []
  const opts = rows.map(c => ({
    label: c.company_name ? `${c.email} (${c.company_name})` : c.email,
    value: c.id,
  }))
  // Keep the current selection addressable even when it's outside the search page
  // (so the picker shows it as selected rather than blank).
  if (
    primaryUserId.value != null
    && !opts.some(o => o.value === primaryUserId.value)
  ) {
    opts.unshift({
      label: primaryContactEmail.value ?? `#${primaryUserId.value}`,
      value: primaryUserId.value,
    })
  }
  return opts
})

const onContactSearch = useDebounceFn((term: string) => {
  contactSearch.value = term
}, 250)

function clearContact() {
  primaryUserId.value = null
  primaryContactEmail.value = null
}

// Assigned B2B price list (nullable). When set, an active member's checkout lines
// are priced from the list. Populated from the admin price-lists list; a "None"
// option clears the assignment (sends `price_list_id: null`).
const priceListId = ref<number | null>(null)
const { data: priceListsPage } = usePriceListsQuery(() => ({ pageSize: 100 }))

// B2B net terms (Program 2 + tail Program A). Enable pay-on-account, assign a
// named payment term (the template deciding the due date), gate which member
// roles may use it, and set an optional credit limit (in the company's default
// currency; blank = unlimited). Kept as standalone refs (outside the
// zod-validated `state`) like the price-list / contact pickers. When editing,
// the credit readout shows outstanding AR + remaining credit.
const NET_TERMS_CURRENCIES = ['USD', 'PLN', 'EUR']
const NET_TERMS_ROLES = ['COMPANY_ADMIN', 'APPROVER', 'BUYER', 'VIEWER'] as const
const DEFAULT_ROLES = ['COMPANY_ADMIN', 'APPROVER', 'BUYER']
const netTermsEnabled = ref(false)
const paymentTermId = ref<number | null>(null)
const allowedRoles = ref<string[]>([...DEFAULT_ROLES])
const creditLimit = ref<number | null>(null)
// The company's billing currency — the credit limit is denominated in it, and
// pay-on-account is only allowed when the checkout currency matches. Required
// whenever net terms is enabled (defaults to USD for a new company).
const billingCurrency = ref<string>('USD')
const { data: paymentTermsPage } = usePaymentTermsQuery(() => ({ pageSize: 100 }))
const paymentTermItems = computed(() => [
  { label: t('admin.companies.netTerms.termNone'), value: null as number | null },
  ...(paymentTermsPage.value?.items ?? []).map(pt => ({
    label: pt.is_active ? pt.name : t('admin.companies.netTerms.termInactive', { name: pt.name }),
    value: pt.id as number | null,
  })),
])
const roleItems = NET_TERMS_ROLES.map(r => ({
  label: t(`admin.companies.netTerms.roles.${r}`),
  value: r as string,
}))
const currencyItems = NET_TERMS_CURRENCIES.map(c => ({ label: c, value: c }))
const { data: companyCredit } = useCompanyCreditQuery(() => props.company?.id ?? null)
const priceListOptions = computed(() => [
  { label: t('admin.companies.form.priceListNone'), value: null as number | null },
  ...(priceListsPage.value?.items ?? []).map(pl => ({
    label: pl.is_active ? pl.name : t('admin.companies.form.priceListInactive', { name: pl.name }),
    value: pl.id as number | null,
  })),
])

const isEdit = computed(() => props.company !== null)
const loading = computed(() => createCompany.isLoading.value || updateCompany.isLoading.value)

const statusOptions = computed(() =>
  STATUSES.map(s => ({ label: t(`admin.companies.status.${s}`), value: s })),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const c = props.company
    state.name = c?.name ?? ''
    state.tax_id = c?.tax_id ?? ''
    state.email = c?.email ?? ''
    state.phone = c?.phone ?? ''
    state.status = c?.status ?? 'pending'
    state.account_manager = c?.account_manager ?? ''
    state.notes = c?.notes ?? ''
    primaryUserId.value = c?.primary_user_id ?? null
    primaryContactEmail.value = c?.primary_user_email ?? null
    priceListId.value = c?.price_list_id ?? null
    netTermsEnabled.value = c?.net_terms_enabled ?? false
    paymentTermId.value = c?.payment_term_id ?? null
    allowedRoles.value = c?.net_terms_allowed_roles ?? [...DEFAULT_ROLES]
    creditLimit.value = c?.credit_limit ?? null
    billingCurrency.value = c?.default_currency ?? 'USD'
    contactSearch.value = ''
  },
  // immediate so an already-open mount (and re-opens) prefill from the company prop.
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

/** Assemble the create body from validated state (client validation runs in UForm). */
function buildCreateBody(): CompanyCreate {
  const trim = (s: string) => s.trim() || null
  return {
    name: state.name.trim(),
    tax_id: trim(state.tax_id),
    email: trim(state.email),
    phone: trim(state.phone),
    status: state.status,
    account_manager: trim(state.account_manager),
    notes: trim(state.notes),
    primary_user_id: primaryUserId.value,
    price_list_id: priceListId.value,
    net_terms_enabled: netTermsEnabled.value,
    // The assigned payment term (null clears → pay-on-account off). Kept even
    // when disabled so re-enabling restores it.
    payment_term_id: paymentTermId.value,
    // Which member roles may pay on account (default admin+approver+buyer).
    net_terms_allowed_roles: allowedRoles.value as CompanyCreate['net_terms_allowed_roles'],
    // Blank = unlimited (explicit null clears any prior limit).
    credit_limit: creditLimit.value,
    // The billing currency the credit limit is denominated in. Only sent when
    // net terms is enabled, so a non-net-terms company's currency is untouched.
    ...(netTermsEnabled.value ? { default_currency: billingCurrency.value } : {}),
  }
}

async function onSubmit() {
  error.value = null
  const body = buildCreateBody()
  try {
    if (props.company) {
      // The whole validated body doubles as the PATCH payload — the backend
      // only applies the fields it receives.
      const patch: CompanyUpdate = { ...body }
      await updateCompany.mutateAsync({ id: props.company.id, patch })
      toast.add({
        title: t('admin.companies.flashes.updated'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    else {
      await createCompany.mutateAsync(body)
      toast.add({
        title: t('admin.companies.flashes.created'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    emit('saved')
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
    :title="isEdit ? t('admin.companies.form.editTitle') : t('admin.companies.form.createTitle')"
    :submit-label="t('admin.companies.form.save')"
    :cancel-label="t('admin.companies.form.cancel')"
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
          :label="t('admin.companies.form.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.companies.form.taxId')"
            :help="t('admin.companies.form.taxIdHint')"
            name="tax_id"
          >
            <UInput
              v-model="state.tax_id"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.companies.form.status')"
            name="status"
          >
            <USelect
              v-model="state.status"
              :items="statusOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.companies.form.email')"
            name="email"
          >
            <UInput
              v-model="state.email"
              type="email"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.companies.form.phone')"
            name="phone"
          >
            <UInput
              v-model="state.phone"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          :label="t('admin.companies.form.accountManager')"
          :help="t('admin.companies.form.accountManagerHint')"
          name="account_manager"
        >
          <UInput
            v-model="state.account_manager"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.companies.primaryContact.label')"
          :help="t('admin.companies.primaryContact.hint')"
          name="primary_user_id"
        >
          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="primaryUserId"
              :items="contactOptions"
              value-key="value"
              searchable
              :placeholder="t('admin.companies.primaryContact.placeholder')"
              :search-input="{ placeholder: t('admin.companies.primaryContact.searchPlaceholder') }"
              class="w-full"
              data-testid="company-primary-contact"
              @update:search-term="onContactSearch"
            />
            <UButton
              v-if="primaryUserId != null"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="sm"
              :aria-label="t('admin.companies.primaryContact.clear')"
              data-testid="company-primary-contact-clear"
              @click="clearContact"
            />
          </div>
          <p
            v-if="primaryContactEmail"
            class="text-xs text-muted mt-1"
            data-testid="company-primary-contact-current"
          >
            {{ t('admin.companies.primaryContact.current', { email: primaryContactEmail }) }}
          </p>
        </UFormField>

        <UFormField
          :label="t('admin.companies.form.priceList')"
          :help="t('admin.companies.form.priceListHint')"
          name="price_list_id"
        >
          <USelect
            v-model="priceListId"
            :items="priceListOptions"
            value-key="value"
            class="w-full"
            data-testid="company-price-list"
          />
        </UFormField>

        <div class="rounded-lg border border-gray-200 p-4 space-y-3 dark:border-gray-800">
          <div>
            <UCheckbox
              v-model="netTermsEnabled"
              :label="t('admin.companies.netTerms.enable')"
              data-testid="company-net-terms-enabled"
            />
            <p class="mt-1 text-xs text-muted">
              {{ t('admin.companies.netTerms.enableHint') }}
            </p>
          </div>

          <div
            v-if="netTermsEnabled"
            class="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <UFormField
              :label="t('admin.companies.netTerms.term')"
              :help="t('admin.companies.netTerms.termHint')"
              name="payment_term_id"
            >
              <USelect
                v-model="paymentTermId"
                :items="paymentTermItems"
                value-key="value"
                class="w-full"
                data-testid="company-payment-term"
              />
            </UFormField>

            <UFormField
              :label="t('admin.companies.netTerms.currency')"
              :help="t('admin.companies.netTerms.currencyHint')"
              name="default_currency"
            >
              <USelect
                v-model="billingCurrency"
                :items="currencyItems"
                value-key="value"
                class="w-full"
                data-testid="company-billing-currency"
              />
            </UFormField>

            <UFormField
              :label="t('admin.companies.netTerms.creditLimit')"
              :help="t('admin.companies.netTerms.creditLimitHint')"
              name="credit_limit"
            >
              <UInput
                v-model.number="creditLimit"
                type="number"
                min="0"
                step="0.01"
                :placeholder="t('admin.companies.netTerms.creditLimitUnlimited')"
                class="w-full"
                data-testid="company-credit-limit"
              />
            </UFormField>
          </div>

          <UFormField
            v-if="netTermsEnabled"
            :label="t('admin.companies.netTerms.allowedRoles')"
            :help="t('admin.companies.netTerms.allowedRolesHint')"
            name="net_terms_allowed_roles"
          >
            <USelectMenu
              v-model="allowedRoles"
              :items="roleItems"
              value-key="value"
              multiple
              class="w-full"
              data-testid="company-allowed-roles"
            />
          </UFormField>

          <p
            v-if="isEdit && netTermsEnabled && companyCredit"
            class="text-xs text-muted"
            data-testid="company-credit-readout"
          >
            {{ t('admin.companies.netTerms.outstanding', {
              outstanding: companyCredit.outstanding,
              currency: companyCredit.currency ?? '',
            }) }}
            <template v-if="companyCredit.available != null">
              · {{ t('admin.companies.netTerms.available', {
                available: companyCredit.available,
                currency: companyCredit.currency ?? '',
              }) }}
            </template>
          </p>
        </div>

        <UFormField
          :label="t('admin.companies.form.notes')"
          name="notes"
        >
          <UTextarea
            v-model="state.notes"
            :rows="3"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
