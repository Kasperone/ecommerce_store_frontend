<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { CompanyMemberResponse } from '~/composables/queries/useTeam'

/**
 * Confirmation modal for a destructive / state-changing team action: removing a
 * member, suspending an active member, or reactivating a suspended one. Stateless
 * and parent-driven (mirrors `DeleteAccountConfirm`): the team page owns the
 * mutation, passes `loading` / `error` down, and reacts to `confirm`.
 *
 * Auto-imports as <AccountTeamMemberActionConfirm> (pathPrefix). The title/body/
 * confirm-label copy switches on `action`; the member's display name is injected
 * so the admin sees exactly who they're acting on.
 */

type TeamAction = 'remove' | 'suspend' | 'reactivate'

const props = defineProps<{
  open: boolean
  action: TeamAction
  member: CompanyMemberResponse | null
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': []
  'cancel': []
}>()

const { t } = useI18n()

const memberName = computed(() =>
  props.member?.user_name || props.member?.user_email || props.member?.invited_email || '',
)

const title = computed(() => t(`account.settings.team.confirm.${props.action}.title`))
const body = computed(() =>
  t(`account.settings.team.confirm.${props.action}.body`, { name: memberName.value }),
)
const confirmLabel = computed(() => t(`account.settings.team.confirm.${props.action}.confirm`))
// Remove is destructive (red); suspend/reactivate are neutral state changes.
const confirmColor = computed(() => (props.action === 'remove' ? 'error' : 'primary'))
const confirmIcon = computed(() =>
  props.action === 'remove'
    ? 'i-lucide-user-x'
    : props.action === 'suspend'
      ? 'i-lucide-ban'
      : 'i-lucide-user-check',
)

function onConfirm() {
  if (props.loading) return
  emit('confirm')
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :dismissible="!loading"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <ErrorAlert
          v-if="error"
          :problem="error"
        />
        <p class="text-sm">
          {{ body }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="loading"
          @click="emit('cancel'); emit('update:open', false)"
        >
          {{ t('account.settings.team.confirm.cancel') }}
        </UButton>
        <UButton
          :color="confirmColor"
          :icon="confirmIcon"
          :loading="loading"
          @click="onConfirm"
        >
          {{ confirmLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
