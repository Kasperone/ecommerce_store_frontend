<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SessionResponse } from '~/composables/queries/useSessions'

/**
 * Active-sessions table. Stateless + parent-driven: the page owns the query,
 * the revoke confirmation modal and the mutation; this component renders the
 * rows, badges the caller's current session, and emits `revoke` with a session
 * when its Revoke button is pressed. The current session has no revoke button
 * (use "sign out everywhere" / plain logout for that).
 */

const props = defineProps<{
  sessions: SessionResponse[]
  loading?: boolean
  revokingId?: number | null
}>()

const emit = defineEmits<{
  revoke: [session: SessionResponse]
}>()

const { t } = useI18n()

const dateTimeFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

const rows = computed(() => props.sessions)
</script>

<template>
  <div class="c-sessions-table overflow-x-auto">
    <table class="w-full text-sm text-left">
      <caption class="sr-only">
        {{ t('account.settings.security.sessions.caption') }}
      </caption>
      <thead class="border-b border-gray-200 dark:border-gray-800">
        <tr class="text-gray-600 dark:text-gray-400">
          <th
            scope="col"
            class="py-2 pr-4 font-medium"
          >
            {{ t('account.settings.security.sessions.device') }}
          </th>
          <th
            scope="col"
            class="py-2 pr-4 font-medium"
          >
            {{ t('account.settings.security.sessions.ip') }}
          </th>
          <th
            scope="col"
            class="py-2 pr-4 font-medium"
          >
            {{ t('account.settings.security.sessions.signedIn') }}
          </th>
          <th
            scope="col"
            class="py-2 pr-4 font-medium"
          >
            {{ t('account.settings.security.sessions.expires') }}
          </th>
          <th
            scope="col"
            class="py-2 font-medium text-right"
          >
            <span class="sr-only">{{ t('account.settings.security.sessions.actions') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-if="loading && rows.length === 0"
        >
          <td
            colspan="5"
            class="py-4 text-gray-500"
          >
            {{ t('account.settings.security.sessions.loading') }}
          </td>
        </tr>
        <tr
          v-else-if="rows.length === 0"
        >
          <td
            colspan="5"
            class="py-4 text-gray-500"
          >
            {{ t('account.settings.security.sessions.empty') }}
          </td>
        </tr>
        <tr
          v-for="session in rows"
          v-else
          :key="session.id"
          class="border-b border-gray-100 dark:border-gray-900 last:border-0"
        >
          <td class="py-3 pr-4">
            <div class="flex items-center gap-2">
              <span class="truncate max-w-xs">
                {{ session.user_agent || t('account.settings.security.sessions.unknownDevice') }}
              </span>
              <UBadge
                v-if="session.current"
                color="primary"
                variant="subtle"
                size="sm"
              >
                {{ t('account.settings.security.sessions.current') }}
              </UBadge>
            </div>
          </td>
          <td class="py-3 pr-4 text-gray-600 dark:text-gray-400">
            {{ session.created_ip || '—' }}
          </td>
          <td class="py-3 pr-4 text-gray-600 dark:text-gray-400">
            {{ formatDate(session.created_at) }}
          </td>
          <td class="py-3 pr-4 text-gray-600 dark:text-gray-400">
            {{ formatDate(session.expires_at) }}
          </td>
          <td class="py-3 text-right">
            <UButton
              v-if="!session.current"
              color="error"
              variant="soft"
              size="sm"
              :loading="revokingId === session.id"
              :aria-label="t('account.settings.security.sessions.revokeLabel')"
              @click="emit('revoke', session)"
            >
              {{ t('account.settings.security.sessions.revoke') }}
            </UButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
