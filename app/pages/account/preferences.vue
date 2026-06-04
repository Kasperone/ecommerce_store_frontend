<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CurrencyCode } from '#shared/utils/money'
import { usePreferencesQuery, useUpdatePreferences } from '~/composables/queries/usePreferences'

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t } = useI18n()
const authStore = useAuthStore()
const toast = useToast()

useHead({
  titleTemplate: '%s | Account',
})

const { currency, setCurrency, currencies } = useCurrencyPreference()

// Persisted preferences snapshot (client-gated; authed). Drives the currency
// select's seed once it resolves; until then we fall back to the live
// cookie/locale default exposed by `useCurrencyPreference`.
const preferences = usePreferencesQuery(() => authStore.isAuthenticated)
const updatePreferences = useUpdatePreferences()

// --- Currency preference ------------------------------------------------------
const currencyOptions = computed(() =>
  currencies.map(c => ({ label: `${c.code} (${c.symbol})`, value: c.code })),
)

// Show the persisted value when known, else the current storefront currency.
const selectedCurrency = computed<CurrencyCode>(
  () => preferences.data.value?.preferred_currency ?? currency.value,
)

const savingCurrency = ref(false)

async function onCurrencyChange(value: unknown) {
  const next = value as CurrencyCode
  if (next === selectedCurrency.value) return
  const previous = currency.value
  savingCurrency.value = true
  try {
    await updatePreferences.mutateAsync({ preferred_currency: next })
    // Apply storewide (cookie + override) only after the server accepted it.
    setCurrency(next)
    toast.add({ title: t('account.settings.preferences.currency.saved'), color: 'success' })
  }
  catch {
    // Roll back to the last good value.
    currency.value = previous
    toast.add({ title: t('account.settings.preferences.currency.error'), color: 'error' })
  }
  finally {
    savingCurrency.value = false
  }
}

// --- Email language -----------------------------------------------------------
// Drives transactional emails (User.locale); independent of the UI language and
// of the shopping currency. Re-homed here from the old /account hub.
const emailLocale = ref<'en' | 'pl'>(authStore.user?.locale ?? 'en')
const savingLocale = ref(false)
const localeOptions = computed(() => [
  { label: t('account.settings.preferences.emailLanguage.en'), value: 'en' },
  { label: t('account.settings.preferences.emailLanguage.pl'), value: 'pl' },
])

watch(
  () => authStore.user?.locale,
  (value) => {
    if (value) emailLocale.value = value
  },
)

async function onEmailLocaleChange(value: unknown) {
  const next = value as 'en' | 'pl'
  if (next === authStore.user?.locale) return
  emailLocale.value = next
  savingLocale.value = true
  const result = await authStore.updateProfile({ locale: next })
  savingLocale.value = false
  if (result.success) {
    toast.add({ title: t('account.settings.preferences.emailLanguage.saved'), color: 'success' })
  }
  else {
    emailLocale.value = authStore.user?.locale ?? 'en' // roll back on failure
    toast.add({
      title: result.error ?? t('account.settings.preferences.emailLanguage.error'),
      color: 'error',
    })
  }
}

// --- Communications (marketing consents) --------------------------------------
// Granular per-topic comms toggles (Phase 4, Baymard §1.1 — granular controls
// reduce blanket unsubscribes). Re-homed here from the old Privacy page, which
// now keeps only GDPR data-rights. Each toggle rides the same /me/preferences
// endpoint: GET returns the latest-per-type snapshot, PATCH appends a new row to
// the append-only consent log. The topics beyond marketing_email/newsletter are
// new free-form consent keys — no backend change needed.
const CONSENT_TYPES = ['marketing_email', 'newsletter', 'product_updates', 'order_tips'] as const
type ConsentType = (typeof CONSENT_TYPES)[number]

const consents = computed(() => preferences.data.value?.consents ?? {})
// One in-flight guard per consent type so its switch shows a pending state.
const savingConsent = reactive<Record<ConsentType, boolean>>({
  marketing_email: false,
  newsletter: false,
  product_updates: false,
  order_tips: false,
})

function consentGranted(type: ConsentType): boolean {
  return consents.value[type] === true
}

async function onConsentChange(type: ConsentType, value: boolean) {
  if (consentGranted(type) === value) return
  savingConsent[type] = true
  try {
    await updatePreferences.mutateAsync({ consents: { [type]: value } })
    toast.add({ title: t('account.settings.preferences.communications.saved'), color: 'success' })
  }
  catch {
    // The snapshot is the source of truth; on failure the switch falls back to
    // the (unchanged) server value because it's bound to the computed snapshot.
    toast.add({ title: t('account.settings.preferences.communications.error'), color: 'error' })
  }
  finally {
    savingConsent[type] = false
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-preferences p-6 max-w-2xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('account.settings.preferences.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.settings.preferences.subtitle') }}
        </p>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            {{ t('account.settings.preferences.currency.title') }}
          </h2>
        </template>
        <UFormField
          :label="t('account.settings.preferences.currency.label')"
          :description="t('account.settings.preferences.currency.hint')"
        >
          <USelect
            :model-value="selectedCurrency"
            :items="currencyOptions"
            value-key="value"
            :loading="savingCurrency"
            :aria-label="t('account.settings.preferences.currency.label')"
            class="w-56"
            @update:model-value="onCurrencyChange"
          />
        </UFormField>
      </UCard>

      <UCard class="mt-6">
        <template #header>
          <h2 class="font-semibold">
            {{ t('account.settings.preferences.emailLanguage.title') }}
          </h2>
        </template>
        <UFormField
          :label="t('account.settings.preferences.emailLanguage.label')"
          :description="t('account.settings.preferences.emailLanguage.hint')"
        >
          <USelect
            :model-value="emailLocale"
            :items="localeOptions"
            value-key="value"
            :loading="savingLocale"
            :aria-label="t('account.settings.preferences.emailLanguage.label')"
            class="w-48"
            @update:model-value="onEmailLocaleChange"
          />
        </UFormField>
      </UCard>

      <UCard class="mt-6">
        <template #header>
          <h2 class="font-semibold">
            {{ t('account.settings.preferences.communications.title') }}
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ t('account.settings.preferences.communications.hint') }}
          </p>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField
            v-for="type in CONSENT_TYPES"
            :key="type"
            :label="t(`account.settings.preferences.communications.${type}.label`)"
            :description="t(`account.settings.preferences.communications.${type}.hint`)"
          >
            <USwitch
              :model-value="consentGranted(type)"
              :loading="savingConsent[type]"
              :aria-label="t(`account.settings.preferences.communications.${type}.label`)"
              @update:model-value="(v: boolean) => onConsentChange(type, v)"
            />
          </UFormField>
        </div>
      </UCard>
    </div>
  </NuxtLayout>
</template>
