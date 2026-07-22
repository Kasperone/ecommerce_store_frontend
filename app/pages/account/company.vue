<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompanyProfileInput } from '#shared/validators/companyProfile'
import { parseProblem } from '#shared/utils/problemDetails'
import {
  useCompanyProfileQuery,
  useUpdateCompanyProfile,
  useVerifyMyCompanyVies,
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

const { t, locale } = useI18n()
const toast = useToast()

useHead({
  title: () => t('account.settings.company.title'),
})

const { data: company, isLoading, error } = useCompanyProfileQuery()
const { mutateAsync: updateProfile } = useUpdateCompanyProfile()

// B2B net-terms credit summary (Program 2). Surfaced as a read-only card when
// the company has pay-on-account enabled, so a buyer can see their term, credit
// limit, outstanding balance and remaining credit alongside the profile.
const { credit: netTermsCredit, netTermsEligible, refetch: refetchCredit } = useCompanyCredit()

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
    { form: 'vat_id', api: 'vat_id' },
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

// VIES verification (Phase-0 tax U5). COMPANY_ADMIN validates the company's EU
// VAT-ID against VIES; the result caches onto the company row. Ships behind the
// backend's kill-switch, so 503 (disabled) is surfaced as a plain message.
const { mutateAsync: verifyVies } = useVerifyMyCompanyVies()
const verifying = ref(false)

function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString(locale.value) : '—'
}

async function onVerifyVies() {
  verifying.value = true
  try {
    const result = await verifyVies()
    if (result.vies_valid) {
      toast.add({ title: t('account.settings.company.vies.verified'), color: 'success' })
    }
    else {
      toast.add({ title: t('account.settings.company.vies.notValid'), color: 'warning' })
    }
  }
  catch (err) {
    toast.add({
      title: parseProblem(err).detail ?? t('account.settings.company.vies.verifyError'),
      color: 'error',
    })
  }
  finally {
    verifying.value = false
  }
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

          <UCard
            v-if="netTermsEligible && netTermsCredit"
            data-testid="company-net-terms-credit"
          >
            <template #header>
              <h3 class="font-semibold">
                {{ t('account.settings.company.netTerms.title') }}
              </h3>
            </template>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt class="text-gray-500 dark:text-gray-400">
                  {{ t('account.settings.company.netTerms.term') }}
                </dt>
                <dd
                  class="font-medium"
                  data-testid="company-net-terms-term"
                >
                  {{ netTermsCredit.payment_term?.name }}
                  <span
                    v-if="netTermsCredit.payment_term"
                    class="text-gray-500 dark:text-gray-400"
                  >· {{ describeTermDue(netTermsCredit.payment_term, t, locale) }}</span>
                </dd>
              </div>
              <div v-if="netTermsCredit.credit_limit != null">
                <dt class="text-gray-500 dark:text-gray-400">
                  {{ t('account.settings.company.netTerms.creditLimit') }}
                </dt>
                <dd class="font-medium">
                  {{ netTermsCredit.credit_limit }} {{ netTermsCredit.currency }}
                </dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400">
                  {{ t('account.settings.company.netTerms.outstanding') }}
                </dt>
                <dd class="font-medium">
                  {{ netTermsCredit.outstanding }} {{ netTermsCredit.currency }}
                </dd>
              </div>
              <div v-if="netTermsCredit.available != null">
                <dt class="text-gray-500 dark:text-gray-400">
                  {{ t('account.settings.company.netTerms.available') }}
                </dt>
                <dd class="font-medium">
                  {{ netTermsCredit.available }} {{ netTermsCredit.currency }}
                </dd>
              </div>
            </dl>

            <!-- Auto-charge card vaulting: only when the admin has opted this
                 company in, and only COMPANY_ADMIN may manage the card. -->
            <div
              v-if="netTermsCredit.auto_charge_enabled && isAdmin"
              class="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"
            >
              <AccountAutoChargeCardSetup
                :card-set="netTermsCredit.auto_charge_card_set"
                @changed="refetchCredit"
              />
            </div>
          </UCard>

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

          <!-- EU VAT-ID / VIES confirmation (Phase-0 tax U5). Drives reverse
               charge on intra-community B2B orders. -->
          <UCard data-testid="company-vies">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <h3 class="font-semibold">
                  {{ t('account.settings.company.vies.title') }}
                </h3>
                <UBadge
                  v-if="company.vat_id"
                  :color="company.vies_valid ? 'success' : 'neutral'"
                  variant="subtle"
                >
                  {{ company.vies_valid
                    ? t('account.settings.company.vies.statusVerified')
                    : t('account.settings.company.vies.statusUnverified') }}
                </UBadge>
              </div>
            </template>

            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {{ t('account.settings.company.vies.subtitle') }}
            </p>

            <div
              v-if="!company.vat_id"
              class="text-sm text-gray-500 dark:text-gray-400"
            >
              {{ t('account.settings.company.vies.noVatId') }}
            </div>
            <dl
              v-else
              class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"
            >
              <div>
                <dt class="text-gray-500 dark:text-gray-400">
                  {{ t('account.settings.company.fields.vatId') }}
                </dt>
                <dd class="font-medium">
                  {{ company.vat_id }}
                </dd>
              </div>
              <div v-if="company.vies_valid && company.vies_confirmed_name">
                <dt class="text-gray-500 dark:text-gray-400">
                  {{ t('account.settings.company.vies.confirmedName') }}
                </dt>
                <dd class="font-medium">
                  {{ company.vies_confirmed_name }}
                </dd>
              </div>
              <div v-if="company.vies_valid">
                <dt class="text-gray-500 dark:text-gray-400">
                  {{ t('account.settings.company.vies.confirmedAt') }}
                </dt>
                <dd class="font-medium">
                  {{ fmtDate(company.vies_confirmed_at) }}
                </dd>
              </div>
              <div v-if="company.vies_last_checked_at">
                <dt class="text-gray-500 dark:text-gray-400">
                  {{ t('account.settings.company.vies.lastChecked') }}
                </dt>
                <dd class="font-medium">
                  {{ fmtDate(company.vies_last_checked_at) }}
                </dd>
              </div>
            </dl>

            <div
              v-if="isAdmin"
              class="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"
            >
              <UButton
                :loading="verifying"
                :disabled="!company.vat_id"
                color="primary"
                variant="soft"
                icon="i-lucide-badge-check"
                data-testid="company-vies-verify"
                @click="onVerifyVies"
              >
                {{ t('account.settings.company.vies.verify') }}
              </UButton>
            </div>
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
