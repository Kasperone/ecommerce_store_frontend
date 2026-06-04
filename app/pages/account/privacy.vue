<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { usePreferencesQuery, useUpdatePreferences } from '~/composables/queries/usePreferences'
import { useDataExport } from '~/composables/queries/useDataExport'
import { useAccountDeletion } from '~/composables/queries/useAccountDeletion'

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t } = useI18n()
const authStore = useAuthStore()
const toast = useToast()
const router = useRouter()
const localePath = useLocalePath()

useHead({
  titleTemplate: '%s | Account',
})

// --- Marketing consents -------------------------------------------------------
// The consent map rides the same /me/preferences endpoint as currency/locale.
// GET returns the latest-per-type snapshot; PATCH appends a new consent row
// server-side. We only ADD the consent UI here — currency/email live on the
// preferences page (Wave A) and are left untouched.
const CONSENT_TYPES = ['marketing_email', 'newsletter'] as const
type ConsentType = (typeof CONSENT_TYPES)[number]

const preferences = usePreferencesQuery(() => authStore.isAuthenticated)
const updatePreferences = useUpdatePreferences()

const consents = computed(() => preferences.data.value?.consents ?? {})
// One in-flight guard per consent type so its switch shows a pending state.
const savingConsent = reactive<Record<ConsentType, boolean>>({
  marketing_email: false,
  newsletter: false,
})

function consentGranted(type: ConsentType): boolean {
  return consents.value[type] === true
}

async function onConsentChange(type: ConsentType, value: boolean) {
  if (consentGranted(type) === value) return
  savingConsent[type] = true
  try {
    await updatePreferences.mutateAsync({ consents: { [type]: value } })
    toast.add({ title: t('account.settings.privacy.consents.saved'), color: 'success' })
  }
  catch {
    // The snapshot is the source of truth; on failure the switch falls back to
    // the (unchanged) server value because it's bound to the computed snapshot.
    toast.add({ title: t('account.settings.privacy.consents.error'), color: 'error' })
  }
  finally {
    savingConsent[type] = false
  }
}

// --- Data export (Art. 15/20) -------------------------------------------------
const dataExport = useDataExport()
const exporting = ref(false)

async function onExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const data = await dataExport.mutateAsync()
    triggerJsonDownload(data)
    toast.add({ title: t('account.settings.privacy.export.success'), color: 'success' })
  }
  catch {
    toast.add({ title: t('account.settings.privacy.export.error'), color: 'error' })
  }
  finally {
    exporting.value = false
  }
}

function triggerJsonDownload(data: unknown) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `account-data-${date}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

// --- Account deletion (Art. 17) -----------------------------------------------
const accountDeletion = useAccountDeletion()
const deleteModalOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<ProblemDetails | null>(null)

function openDeleteModal() {
  deleteError.value = null
  deleteModalOpen.value = true
}

async function onDeleteConfirm() {
  if (deleting.value) return
  deleting.value = true
  deleteError.value = null
  try {
    await accountDeletion.mutateAsync()
    // The backend has already revoked every refresh token + placeholdered the
    // login email. Tear down the local session (clearSession, NOT logout — the
    // refresh cookie is now useless and a server logout would just 401) and
    // send the user home with an explanation.
    deleteModalOpen.value = false
    authStore.clearSession()
    toast.add({ title: t('account.settings.privacy.delete.success'), color: 'success' })
    await router.push(localePath('/'))
  }
  catch (err) {
    deleteError.value = parseProblem(err)
    toast.add({ title: t('account.settings.privacy.delete.error'), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-privacy p-6 max-w-2xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('account.settings.privacy.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.settings.privacy.subtitle') }}
        </p>
      </div>

      <!-- Marketing consents -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            {{ t('account.settings.privacy.consents.title') }}
          </h2>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField
            v-for="type in CONSENT_TYPES"
            :key="type"
            :label="t(`account.settings.privacy.consents.${type}.label`)"
            :description="t(`account.settings.privacy.consents.${type}.hint`)"
          >
            <USwitch
              :model-value="consentGranted(type)"
              :loading="savingConsent[type]"
              :aria-label="t(`account.settings.privacy.consents.${type}.label`)"
              @update:model-value="(v: boolean) => onConsentChange(type, v)"
            />
          </UFormField>
        </div>
      </UCard>

      <!-- Data export -->
      <UCard class="mt-6">
        <template #header>
          <h2 class="font-semibold">
            {{ t('account.settings.privacy.export.title') }}
          </h2>
        </template>
        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('account.settings.privacy.export.hint') }}
          </p>
          <div>
            <UButton
              icon="i-lucide-download"
              :loading="exporting"
              @click="onExport"
            >
              {{ t('account.settings.privacy.export.button') }}
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Delete account -->
      <UCard class="mt-6">
        <template #header>
          <h2 class="font-semibold text-error">
            {{ t('account.settings.privacy.delete.title') }}
          </h2>
        </template>
        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('account.settings.privacy.delete.hint') }}
          </p>
          <div>
            <UButton
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              @click="openDeleteModal"
            >
              {{ t('account.settings.privacy.delete.button') }}
            </UButton>
          </div>
        </div>
      </UCard>

      <AccountPrivacyDeleteAccountConfirm
        v-model:open="deleteModalOpen"
        :loading="deleting"
        :error="deleteError"
        @confirm="onDeleteConfirm"
      />
    </div>
  </NuxtLayout>
</template>
