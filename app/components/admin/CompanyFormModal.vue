<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type {
  CompanyCreate,
  CompanyResponse,
  CompanyStatus,
  CompanyUpdate,
} from '~/composables/queries/useCompanyQueries'
import { parseProblem } from '#shared/utils/problemDetails'

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

const name = ref('')
const taxId = ref('')
const email = ref('')
const phone = ref('')
const status = ref<CompanyStatus>('pending')
const accountManager = ref('')
const notes = ref('')
const error = ref<ProblemDetails | null>(null)

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
    name.value = c?.name ?? ''
    taxId.value = c?.tax_id ?? ''
    email.value = c?.email ?? ''
    phone.value = c?.phone ?? ''
    status.value = c?.status ?? 'pending'
    accountManager.value = c?.account_manager ?? ''
    notes.value = c?.notes ?? ''
    primaryUserId.value = c?.primary_user_id ?? null
    primaryContactEmail.value = c?.primary_user_email ?? null
    contactSearch.value = ''
  },
  // immediate so an already-open mount (and re-opens) prefill from the company prop.
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function fail(messageKey: string): null {
  error.value = { title: t(messageKey) }
  return null
}

/** Validate + assemble the create body. Returns null (and sets `error`) on failure. */
function buildCreateBody(): CompanyCreate | null {
  const trimmedName = name.value.trim()
  if (!trimmedName) return fail('admin.companies.errors.nameRequired')

  const trim = (s: string) => s.trim() || null
  return {
    name: trimmedName,
    tax_id: trim(taxId.value),
    email: trim(email.value),
    phone: trim(phone.value),
    status: status.value,
    account_manager: trim(accountManager.value),
    notes: trim(notes.value),
    primary_user_id: primaryUserId.value,
  }
}

async function onSubmit() {
  error.value = null
  const body = buildCreateBody()
  if (body === null) return
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
    error.value = parseProblem(err)
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
            v-model="name"
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
              v-model="taxId"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.companies.form.status')"
            name="status"
          >
            <USelect
              v-model="status"
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
              v-model="email"
              type="email"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.companies.form.phone')"
            name="phone"
          >
            <UInput
              v-model="phone"
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
            v-model="accountManager"
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
          :label="t('admin.companies.form.notes')"
          name="notes"
        >
          <UTextarea
            v-model="notes"
            :rows="3"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
