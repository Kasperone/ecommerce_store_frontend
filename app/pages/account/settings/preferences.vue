<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CurrencyCode } from '#shared/utils/money'
import { usePreferencesQuery, useUpdatePreferences } from '~/composables/queries/usePreferences'

definePageMeta({
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
    </div>
  </NuxtLayout>
</template>
