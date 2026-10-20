<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { COMPANY_ROLES } from '~/composables/queries/useTeam'
import type { CompanyMemberInvite } from '~/composables/queries/useTeam'
import type { CompanyRole } from '~/composables/queries/useCompany'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

/**
 * Invite-a-member form (COMPANY_ADMIN only — the page hides it for non-admins).
 * Stateless + parent-driven: the page owns the invite mutation and surfaces the
 * 404 (no account for that email — D-D-7) / 409 (already a member) results; this
 * form validates email + role and emits the typed payload on submit.
 *
 * Auto-imports as <AccountTeamInviteForm> (pathPrefix). Every control is
 * labelled (UFormField `label`) for EAA conformance.
 */

const props = defineProps<{
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
}>()

const emit = defineEmits<{
  submit: [values: CompanyMemberInvite]
}>()

const { t } = useI18n()
const toast = useToast()

const schema = computed(() =>
  z.object({
    email: z.string().trim().min(1, t('account.settings.team.invite.errors.emailRequired'))
      .email(t('account.settings.team.invite.errors.emailInvalid')),
    role: z.enum(COMPANY_ROLES as [CompanyRole, ...CompanyRole[]]),
  }),
)
type InviteInput = z.infer<ReturnType<typeof schema['value']>>

const state = reactive<InviteInput>({
  email: '',
  role: 'BUYER',
})

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'account.settings.team.invite.error',
})

// The page owns the invite mutation; surface its raw error here so the form
// drives the same flow as signin (message + backend field mapping).
watch(
  () => props.error,
  (err) => {
    if (err) applyApiError(err, t('account.settings.team.invite.error'))
    else errorMessage.value = ''
  },
)

const roleItems = computed(() =>
  COMPANY_ROLES.map(role => ({
    value: role,
    label: t(`account.settings.team.roles.${role}`),
  })),
)

function onSubmit(event: { data: InviteInput }) {
  emit('submit', { email: event.data.email.trim(), role: event.data.role })
  // Reset the email so the next invite starts clean; keep the role selection.
  state.email = ''
}

// Exposed so component/page tests can seed the non-native role <USelect>, which
// can't be driven through happy-dom's DOM events.
defineExpose({ state })
</script>

<template>
  <UForm
    ref="formRef"
    :schema="schema"
    :state="state"
    :validate-on="[]"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="t('account.settings.team.invite.error')"
      :description="errorMessage"
      :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
      @close="errorMessage = ''"
    />

    <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
      <UFormField
        :label="t('account.settings.team.invite.email')"
        name="email"
        required
        class="flex-1"
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          :placeholder="t('account.settings.team.invite.emailPlaceholder')"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('account.settings.team.invite.role')"
        name="role"
        required
        class="sm:w-48"
      >
        <USelect
          v-model="state.role"
          :items="roleItems"
          value-key="value"
          :aria-label="t('account.settings.team.invite.role')"
          class="w-full"
        />
      </UFormField>

      <div class="sm:pt-6">
        <UButton
          type="submit"
          color="primary"
          icon="i-lucide-user-plus"
          :loading="loading"
          block
        >
          {{ t('account.settings.team.invite.submit') }}
        </UButton>
      </div>
    </div>
  </UForm>
</template>
