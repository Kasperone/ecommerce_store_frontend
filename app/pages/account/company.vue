<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompanyProfileInput } from '#shared/validators/companyProfile'
import {
  useCompanyProfileQuery,
  useUpdateCompanyProfile,
  type CompanyProfileUpdate,
} from '~/composables/queries/useCompany'

/**
 * B2B company-profile settings (Wave D / D-D-4 + D-D-6).
 *
 * Resolves the caller's company via the client-gated `GET /companies/me` query
 * (which carries their B2B `role`). COMPANY_ADMIN sees an editable form that
 * PATCHes the narrow profile allow-list (rollback handled by the non-optimistic
 * mutation + an error toast); BUYER / VIEWER see the same data read-only. A 404
 * (not a company member) renders a friendly "not a business account" panel —
 * the nav entry is itself gated so this is an edge case for a deep-linked URL.
 *
 * Only changed fields are sent (the backend PATCH is partial; an emptied field
 * is sent as `''`, which the backend trims to `null`).
 */

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t } = useI18n()
const toast = useToast()

useHead({
  title: () => t('account.settings.company.title'),
})

const { data: company, isLoading, error } = useCompanyProfileQuery()
const { mutateAsync: updateProfile } = useUpdateCompanyProfile()

const isAdmin = computed(() => company.value?.role === 'COMPANY_ADMIN')
// "Not a B2B member" resolves two ways: the endpoint returns 200 + a null body
// (current — `company.value === null`), or, against an older backend, a 404
// that sets `error`. Either way the query has settled with no company.
// `=== null` (not just falsy) avoids a flash before the first fetch, when
// `company` is still `undefined`.
const notAMember = computed(
  () => !isLoading.value && (company.value === null || !!error.value),
)

const saving = ref(false)
// Raw caught submit error, passed to the form which drives the signin flow.
const formError = ref<unknown>(null)

/**
 * Build the partial PATCH body: only keys whose trimmed value differs from the
 * currently-loaded company are included (the page never resends unchanged data).
 * An emptied field is sent as `''` so the backend clears it to `null`.
 */
function buildPatch(values: CompanyProfileInput): CompanyProfileUpdate {
  const current = company.value
  if (!current) return {}
  const patch: CompanyProfileUpdate = {}
  const fields: { form: keyof CompanyProfileInput, api: keyof CompanyProfileUpdate }[] = [
    { form: 'tax_id', api: 'tax_id' },
    { form: 'regon', api: 'regon' },
    { form: 'email', api: 'email' },
    { form: 'phone', api: 'phone' },
    { form: 'billing_address_street', api: 'billing_address_street' },
    { form: 'billing_address_city', api: 'billing_address_city' },
    { form: 'billing_address_postal_code', api: 'billing_address_postal_code' },
    { form: 'billing_address_country', api: 'billing_address_country' },
    { form: 'billing_address_state', api: 'billing_address_state' },
    { form: 'default_currency', api: 'default_currency' },
  ]
  for (const { form, api } of fields) {
    const next = (values[form] ?? '').trim()
    const prev = (current[api] ?? '').toString()
    if (next !== prev) patch[api] = next
  }
  return patch
}

async function onSubmit(values: CompanyProfileInput) {
  const patch = buildPatch(values)
  if (Object.keys(patch).length === 0) {
    toast.add({ title: t('account.settings.company.noChanges'), color: 'neutral' })
    return
  }
  saving.value = true
  formError.value = null
  try {
    await updateProfile(patch)
    toast.add({ title: t('account.settings.company.saved'), color: 'success' })
  }
  catch (err) {
    // Non-optimistic mutation: the cached company is untouched on failure, so the
    // form's seeded values remain the last-known-good state (rollback). The form
    // surfaces the message inline + raises the error toast.
    formError.value = err
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-company p-6 max-w-2xl mx-auto space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold">
            {{ t('account.settings.company.title') }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('account.settings.company.subtitle') }}
          </p>
        </div>
        <AccountCompanyStatusBadge
          v-if="company"
          :status="company.status"
        />
      </div>

      <ClientOnly>
        <div
          v-if="isLoading"
          class="py-8 text-center text-gray-500"
        >
          {{ t('account.settings.company.loading') }}
        </div>

        <div
          v-else-if="notAMember"
          class="rounded-lg border border-dashed border-gray-300 py-12 text-center dark:border-gray-700"
        >
          <UIcon
            name="i-lucide-building"
            class="mx-auto mb-2 size-8 text-gray-400"
          />
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('account.settings.company.notAMember') }}
          </p>
        </div>

        <template v-else-if="company">
          <p
            v-if="company.name"
            class="text-lg font-semibold"
          >
            {{ company.name }}
          </p>

          <UAlert
            v-if="company.status === 'pending'"
            color="warning"
            variant="subtle"
            icon="i-lucide-clock"
            :title="t('account.settings.company.pendingTitle')"
            :description="t('account.settings.company.pendingBody')"
          />

          <UCard>
            <AccountCompanyProfileForm
              v-if="isAdmin"
              :company="company"
              :loading="saving"
              :error="formError"
              @submit="onSubmit"
            />
            <template v-else>
              <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
                {{ t('account.settings.company.readOnlyNotice') }}
              </p>
              <AccountCompanyProfileView :company="company" />
            </template>
          </UCard>
        </template>

        <template #fallback>
          <div class="py-8 text-center text-gray-500">
            {{ t('account.settings.company.loading') }}
          </div>
        </template>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
