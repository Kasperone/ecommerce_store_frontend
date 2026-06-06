<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormSubmitEvent } from '@nuxt/ui'
import { AUTH_ENDPOINTS } from '#shared/constants/api'
import { createChangePasswordSchema } from '#shared/validators/auth'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import {
  useSessionsQuery,
  useRevokeSession,
  type SessionResponse,
} from '~/composables/queries/useSessions'

/**
 * Security settings: change-password form + active-sessions management.
 *
 * - Change password reuses `authStore.changePassword(current, new)`.
 * - Sessions list comes from the client-gated Colada query; revoke deletes one
 *   session (behind a confirm modal); "sign out everywhere" hits the existing
 *   `POST /auth/logout-all` (revokes the whole refresh family + bumps
 *   `password_changed_at`), then tears down the local session and bounces to
 *   /login.
 */

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t } = useI18n()
const authStore = useAuthStore()
const toast = useToast()
const router = useRouter()
const { apiFetch } = useApi()

useHead({
  titleTemplate: '%s | Account',
})

// ---- Change password ----

interface PasswordState {
  current_password: string
  new_password: string
  confirm_password: string
}

const pwState = reactive<PasswordState>({
  current_password: '',
  new_password: '',
  confirm_password: '',
})

const pwSchema = computed(() => createChangePasswordSchema(t))

const pwFormRef = useTemplateRef<ValidatedFormInstance>('pwFormRef')
const { errorMessage: pwErrorMessage, applyApiError: applyPwError } = useValidatedForm(pwFormRef, {
  state: () => pwState,
  toast,
  t,
  toastTitleKey: 'account.settings.security.password.error',
})

const changingPassword = ref(false)

async function onChangePassword(_event: FormSubmitEvent<PasswordState>) {
  changingPassword.value = true
  pwErrorMessage.value = ''
  const result = await authStore.changePassword(
    pwState.current_password,
    pwState.new_password,
  )
  changingPassword.value = false

  if (result.success) {
    toast.add({ title: t('account.settings.security.password.saved'), color: 'success' })
    pwState.current_password = ''
    pwState.new_password = ''
    pwState.confirm_password = ''
  }
  else {
    applyPwError(result.raw, result.error ?? t('account.settings.security.password.error'))
  }
}

// ---- Sessions ----

const { data: sessions, isLoading: sessionsLoading } = useSessionsQuery()
const { mutateAsync: revokeSession } = useRevokeSession()

const revokeTarget = ref<SessionResponse | null>(null)
const revokeOpen = ref(false)
const revokingId = ref<number | null>(null)

function onRevokeRequest(session: SessionResponse) {
  revokeTarget.value = session
  revokeOpen.value = true
}

async function onConfirmRevoke() {
  const target = revokeTarget.value
  if (!target) return
  revokingId.value = target.id
  try {
    await revokeSession(target.id)
    toast.add({ title: t('account.settings.security.sessions.revoked'), color: 'success' })
    revokeOpen.value = false
    revokeTarget.value = null
  }
  catch {
    toast.add({ title: t('account.settings.security.sessions.revokeError'), color: 'error' })
  }
  finally {
    revokingId.value = null
  }
}

// ---- Sign out everywhere ----

const signOutAllOpen = ref(false)
const signingOutAll = ref(false)

async function onConfirmSignOutAll() {
  signingOutAll.value = true
  try {
    await apiFetch(AUTH_ENDPOINTS.LOGOUT_ALL, { method: 'POST' })
    // Server revoked the whole refresh family + invalidated existing access
    // tokens; tear down locally and bounce to login.
    authStore.clearSession()
    signOutAllOpen.value = false
    await router.push('/login')
  }
  catch {
    toast.add({ title: t('account.settings.security.signOutAll.error'), color: 'error' })
    signingOutAll.value = false
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-security p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 class="text-2xl font-bold">
          {{ t('account.settings.security.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.settings.security.subtitle') }}
        </p>
      </div>

      <!-- Change password -->
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            {{ t('account.settings.security.password.title') }}
          </h2>
        </template>

        <UForm
          ref="pwFormRef"
          :schema="pwSchema"
          :state="pwState"
          :validate-on="['submit']"
          class="space-y-6"
          @submit="onChangePassword"
        >
          <UAlert
            v-if="pwErrorMessage"
            color="error"
            variant="soft"
            :title="t('account.settings.security.password.error')"
            :description="pwErrorMessage"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="pwErrorMessage = ''"
          />
          <UFormField
            :label="t('account.settings.security.password.current')"
            name="current_password"
            required
          >
            <UInput
              v-model="pwState.current_password"
              type="password"
              autocomplete="current-password"
              :disabled="changingPassword"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('account.settings.security.password.new')"
            :help="t('account.settings.security.password.newHint')"
            name="new_password"
            required
          >
            <UInput
              v-model="pwState.new_password"
              type="password"
              autocomplete="new-password"
              :disabled="changingPassword"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('account.settings.security.password.confirm')"
            name="confirm_password"
            required
          >
            <UInput
              v-model="pwState.confirm_password"
              type="password"
              autocomplete="new-password"
              :disabled="changingPassword"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end pt-2">
            <UButton
              type="submit"
              color="primary"
              :loading="changingPassword"
            >
              {{ t('account.settings.security.password.save') }}
            </UButton>
          </div>
        </UForm>
      </UCard>

      <!-- Active sessions -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              {{ t('account.settings.security.sessions.title') }}
            </h2>
            <UButton
              color="error"
              variant="outline"
              size="sm"
              @click="signOutAllOpen = true"
            >
              {{ t('account.settings.security.signOutAll.button') }}
            </UButton>
          </div>
        </template>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {{ t('account.settings.security.sessions.subtitle') }}
        </p>

        <AccountSecuritySessionsTable
          :sessions="sessions ?? []"
          :loading="sessionsLoading"
          :revoking-id="revokingId"
          @revoke="onRevokeRequest"
        />
      </UCard>
    </div>

    <!-- Revoke-one confirmation -->
    <UModal
      v-model:open="revokeOpen"
      :title="t('account.settings.security.sessions.revokeConfirmTitle')"
      :dismissible="revokingId === null"
    >
      <template #body>
        <p class="text-sm">
          {{ t('account.settings.security.sessions.revokeConfirmBody') }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="soft"
            :disabled="revokingId !== null"
            @click="revokeOpen = false"
          >
            {{ t('account.settings.security.sessions.cancel') }}
          </UButton>
          <UButton
            color="error"
            :loading="revokingId !== null"
            @click="onConfirmRevoke"
          >
            {{ t('account.settings.security.sessions.revoke') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Sign-out-everywhere confirmation -->
    <UModal
      v-model:open="signOutAllOpen"
      :title="t('account.settings.security.signOutAll.confirmTitle')"
      :dismissible="!signingOutAll"
    >
      <template #body>
        <p class="text-sm">
          {{ t('account.settings.security.signOutAll.confirmBody') }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="soft"
            :disabled="signingOutAll"
            @click="signOutAllOpen = false"
          >
            {{ t('account.settings.security.signOutAll.cancel') }}
          </UButton>
          <UButton
            color="error"
            :loading="signingOutAll"
            @click="onConfirmSignOutAll"
          >
            {{ t('account.settings.security.signOutAll.button') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </NuxtLayout>
</template>
