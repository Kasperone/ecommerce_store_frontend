<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { COMPANY_ROLES } from '~/composables/queries/useTeam'
import type { CompanyMemberResponse } from '~/composables/queries/useTeam'
import type { CompanyRole } from '~/composables/queries/useCompany'

/**
 * Company team roster table. Stateless + parent-driven: the team page owns the
 * query, the confirm modals and the mutations; this table renders the rows,
 * badges role + status, and — only when `canManage` (the caller is COMPANY_ADMIN)
 * — exposes the per-row controls (role <select>, suspend/reactivate, remove),
 * emitting the intent for the page to confirm + run. For non-admins the table is
 * read-only (no action column controls).
 *
 * Auto-imports as <AccountTeamMemberTable> (pathPrefix). Real `<th scope="col">`
 * headers + labelled controls for EAA conformance. `busyId` disables a row's
 * controls while that member has a mutation in flight.
 */

const props = defineProps<{
  members: CompanyMemberResponse[]
  canManage?: boolean
  loading?: boolean
  busyId?: number | null
}>()

const emit = defineEmits<{
  'change-role': [payload: { member: CompanyMemberResponse, role: CompanyRole }]
  'suspend': [member: CompanyMemberResponse]
  'reactivate': [member: CompanyMemberResponse]
  'remove': [member: CompanyMemberResponse]
}>()

const { t } = useI18n()

const rows = computed(() => props.members)

const roleItems = computed(() =>
  COMPANY_ROLES.map(role => ({
    value: role,
    label: t(`account.settings.team.roles.${role}`),
  })),
)

function memberName(m: CompanyMemberResponse): string {
  return m.user_name || m.user_email || m.invited_email || t('account.settings.team.table.unknownMember')
}

// Per-row action aria-label ("Suspend {name}" etc.) — kept short at the call site.
function actionLabel(action: 'suspend' | 'reactivate' | 'remove', m: CompanyMemberResponse): string {
  return t(`account.settings.team.actions.${action}Label`, { name: memberName(m) })
}

function onRoleChange(member: CompanyMemberResponse, value: unknown) {
  const role = value as CompanyRole
  if (role === member.role) return
  emit('change-role', { member, role })
}
</script>

<template>
  <div class="c-team-table overflow-x-auto">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">
        {{ t('account.settings.team.table.caption') }}
      </caption>
      <thead class="border-b border-gray-200 dark:border-gray-800">
        <tr class="text-gray-600 dark:text-gray-400">
          <th
            scope="col"
            class="py-2 pr-4 font-medium"
          >
            {{ t('account.settings.team.table.member') }}
          </th>
          <th
            scope="col"
            class="py-2 pr-4 font-medium"
          >
            {{ t('account.settings.team.table.role') }}
          </th>
          <th
            scope="col"
            class="py-2 pr-4 font-medium"
          >
            {{ t('account.settings.team.table.status') }}
          </th>
          <th
            v-if="canManage"
            scope="col"
            class="py-2 text-right font-medium"
          >
            <span class="sr-only">{{ t('account.settings.team.table.actions') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && rows.length === 0">
          <td
            :colspan="canManage ? 4 : 3"
            class="py-4 text-gray-500"
          >
            {{ t('account.settings.team.table.loading') }}
          </td>
        </tr>
        <tr v-else-if="rows.length === 0">
          <td
            :colspan="canManage ? 4 : 3"
            class="py-4 text-gray-500"
            data-testid="team-empty"
          >
            {{ t('account.settings.team.table.empty') }}
          </td>
        </tr>
        <tr
          v-for="member in rows"
          v-else
          :key="member.id"
          class="border-b border-gray-100 last:border-0 dark:border-gray-900"
        >
          <td class="py-3 pr-4">
            <div class="flex flex-col">
              <span class="font-medium">{{ memberName(member) }}</span>
              <span
                v-if="member.user_email && member.user_name"
                class="text-xs text-gray-500 dark:text-gray-400"
              >
                {{ member.user_email }}
              </span>
            </div>
          </td>
          <td class="py-3 pr-4">
            <USelect
              v-if="canManage"
              :model-value="member.role"
              :items="roleItems"
              value-key="value"
              size="sm"
              :disabled="busyId === member.id"
              :aria-label="t('account.settings.team.table.roleFor', { name: memberName(member) })"
              class="w-40"
              @update:model-value="(v: unknown) => onRoleChange(member, v)"
            />
            <AccountTeamRoleBadge
              v-else
              :role="member.role"
            />
          </td>
          <td class="py-3 pr-4">
            <AccountTeamMemberStatusBadge :status="member.status" />
          </td>
          <td
            v-if="canManage"
            class="py-3 text-right"
          >
            <div class="flex justify-end gap-2">
              <UButton
                v-if="member.status === 'suspended'"
                color="primary"
                variant="soft"
                size="sm"
                icon="i-lucide-user-check"
                :disabled="busyId === member.id"
                :aria-label="actionLabel('reactivate', member)"
                @click="emit('reactivate', member)"
              >
                {{ t('account.settings.team.actions.reactivate') }}
              </UButton>
              <UButton
                v-else
                color="warning"
                variant="soft"
                size="sm"
                icon="i-lucide-ban"
                :disabled="busyId === member.id"
                :aria-label="actionLabel('suspend', member)"
                @click="emit('suspend', member)"
              >
                {{ t('account.settings.team.actions.suspend') }}
              </UButton>
              <UButton
                color="error"
                variant="soft"
                size="sm"
                icon="i-lucide-user-x"
                :disabled="busyId === member.id"
                :aria-label="actionLabel('remove', member)"
                @click="emit('remove', member)"
              >
                {{ t('account.settings.team.actions.remove') }}
              </UButton>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
