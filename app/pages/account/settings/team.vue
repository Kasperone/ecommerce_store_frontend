<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { narrowFetchError } from '~/utils/apiError'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import {
  useInviteMember,
  useRemoveMember,
  useTeamQuery,
  useUpdateMember,
} from '~/composables/queries/useTeam'
import type {
  CompanyMemberInvite,
  CompanyMemberResponse,
  CompanyRole,
} from '~/composables/queries/useTeam'

/**
 * B2B company team management (slice 5). Any active member can read the roster;
 * only a COMPANY_ADMIN sees the invite form + per-row role / suspend / remove
 * controls (gated on `useCompanyContext().role === 'COMPANY_ADMIN'`, matching the
 * backend's own gate — non-admins get a 403 on mutations, but we never show them).
 *
 * The page owns the query, the mutations, the confirm modal, and surfaces the
 * backend errors as friendly copy: an invite to an unknown email 404s (D-D-7 —
 * "no account found for that email; they must register first"); demoting /
 * suspending / removing the last active COMPANY_ADMIN 409s.
 */

definePageMeta({ middleware: 'user' })

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

const { isB2B, isResolving, company } = useCompanyContext()
const canManage = computed(() => company.value?.role === 'COMPANY_ADMIN')

const { data: members, error: listError } = useTeamQuery()
const roster = computed<CompanyMemberResponse[]>(() => members.value ?? [])

useHead({ title: () => t('account.settings.team.title') })

// --- Invite -------------------------------------------------------------------
const invite = useInviteMember()
const inviting = ref(false)
const inviteError = ref<ProblemDetails | null>(null)

async function onInvite(values: CompanyMemberInvite) {
  if (inviting.value) return
  inviting.value = true
  inviteError.value = null
  try {
    await invite.mutateAsync(values)
    toast.add({ title: t('account.settings.team.invite.success'), color: 'success' })
  }
  catch (err) {
    const { status } = narrowFetchError(err)
    // D-D-7: an invite requires the email to already have an account. The backend
    // 404s an unknown address; surface the actionable "must register first" copy
    // rather than the raw "No user with that email" detail.
    if (status === 404) {
      inviteError.value = { title: t('account.settings.team.invite.errors.noAccount') }
    }
    else if (status === 409) {
      inviteError.value = { title: t('account.settings.team.invite.errors.alreadyMember') }
    }
    else {
      inviteError.value = parseProblem(err)
    }
    toast.add({ title: t('account.settings.team.invite.error'), color: 'error' })
  }
  finally {
    inviting.value = false
  }
}

// --- Role change (inline, no modal) -------------------------------------------
const updateMember = useUpdateMember()
const removeMember = useRemoveMember()
// One in-flight member id so its row controls disable while a mutation runs.
const busyId = ref<number | null>(null)
const actionError = ref<ProblemDetails | null>(null)

function lastAdminProblem(err: unknown): ProblemDetails {
  const { status } = narrowFetchError(err)
  // The last-active-COMPANY_ADMIN guard 409s; give it dedicated copy.
  return status === 409
    ? { title: t('account.settings.team.errors.lastAdmin') }
    : (parseProblem(err) ?? { title: t('account.settings.team.errors.actionFailed') })
}

async function onChangeRole(payload: { member: CompanyMemberResponse, role: CompanyRole }) {
  busyId.value = payload.member.id
  actionError.value = null
  try {
    await updateMember.mutateAsync({ id: payload.member.id, patch: { role: payload.role } })
    toast.add({ title: t('account.settings.team.roleChanged'), color: 'success' })
  }
  catch (err) {
    actionError.value = lastAdminProblem(err)
    toast.add({ title: t('account.settings.team.errors.actionFailed'), color: 'error' })
  }
  finally {
    busyId.value = null
  }
}

// --- Suspend / reactivate / remove (confirm modal) ----------------------------
type TeamAction = 'remove' | 'suspend' | 'reactivate'
const modalOpen = ref(false)
const modalAction = ref<TeamAction>('remove')
const modalMember = ref<CompanyMemberResponse | null>(null)
const modalLoading = ref(false)
const modalError = ref<ProblemDetails | null>(null)

function openConfirm(action: TeamAction, member: CompanyMemberResponse) {
  modalAction.value = action
  modalMember.value = member
  modalError.value = null
  modalOpen.value = true
}

async function onConfirm() {
  const member = modalMember.value
  if (!member || modalLoading.value) return
  modalLoading.value = true
  modalError.value = null
  try {
    if (modalAction.value === 'remove') {
      await removeMember.mutateAsync(member.id)
    }
    else {
      const status = modalAction.value === 'suspend' ? 'suspended' : 'active'
      await updateMember.mutateAsync({ id: member.id, patch: { status } })
    }
    modalOpen.value = false
    toast.add({ title: t(`account.settings.team.confirm.${modalAction.value}.success`), color: 'success' })
  }
  catch (err) {
    modalError.value = lastAdminProblem(err)
    toast.add({ title: t('account.settings.team.errors.actionFailed'), color: 'error' })
  }
  finally {
    modalLoading.value = false
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-team mx-auto max-w-4xl p-6">
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('account.settings.team.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.settings.team.subtitle') }}
        </p>
      </div>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <ClientOnly>
        <!-- Not a B2B account: the customer reached the page directly. -->
        <div
          v-if="!isResolving && !isB2B"
          class="flex flex-col items-center gap-4 py-16 text-center"
          data-testid="not-b2b"
        >
          <UIcon
            name="i-lucide-building-2"
            class="size-12 text-muted"
          />
          <p class="text-muted">
            {{ t('account.settings.team.notB2B') }}
          </p>
          <UButton
            color="primary"
            :to="localePath('/account')"
          >
            {{ t('account.settings.team.backToAccount') }}
          </UButton>
        </div>

        <template v-else>
          <!-- Invite (COMPANY_ADMIN only) -->
          <UCard v-if="canManage">
            <template #header>
              <h2 class="font-semibold">
                {{ t('account.settings.team.invite.title') }}
              </h2>
            </template>
            <div class="flex flex-col gap-3">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ t('account.settings.team.invite.hint') }}
              </p>
              <ErrorAlert
                v-if="inviteError"
                :problem="inviteError"
              />
              <AccountTeamInviteForm
                :loading="inviting"
                @submit="onInvite"
              />
            </div>
          </UCard>

          <!-- Read-only notice for non-admins -->
          <UAlert
            v-else
            class="mb-6"
            color="neutral"
            variant="subtle"
            icon="i-lucide-eye"
            :title="t('account.settings.team.readOnly.title')"
            :description="t('account.settings.team.readOnly.body')"
          />

          <!-- Roster -->
          <UCard :class="canManage ? 'mt-6' : ''">
            <template #header>
              <h2 class="font-semibold">
                {{ t('account.settings.team.roster.title') }}
              </h2>
            </template>
            <ErrorAlert
              v-if="actionError"
              class="mb-3"
              :problem="actionError"
            />
            <AccountTeamMemberTable
              :members="roster"
              :can-manage="canManage"
              :loading="!members"
              :busy-id="busyId"
              @change-role="onChangeRole"
              @suspend="(m) => openConfirm('suspend', m)"
              @reactivate="(m) => openConfirm('reactivate', m)"
              @remove="(m) => openConfirm('remove', m)"
            />
          </UCard>
        </template>

        <template #fallback>
          <div class="py-12 text-center text-muted">
            {{ t('actions.loading') }}
          </div>
        </template>
      </ClientOnly>

      <AccountTeamMemberActionConfirm
        v-model:open="modalOpen"
        :action="modalAction"
        :member="modalMember"
        :loading="modalLoading"
        :error="modalError"
        @confirm="onConfirm"
      />
    </div>
  </NuxtLayout>
</template>
