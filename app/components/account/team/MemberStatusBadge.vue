<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { companyMemberStatusColor } from '~/composables/queries/useTeam'
import type { CompanyMemberStatus } from '~/composables/queries/useTeam'

// Auto-imports as <AccountTeamMemberStatusBadge> (pathPrefix) — the bare name
// renders nothing. Labels live under `account.settings.team.statuses.*`.
const props = defineProps<{ status: CompanyMemberStatus }>()

const { t } = useI18n()
const color = computed(() => companyMemberStatusColor(props.status))
</script>

<template>
  <UBadge
    :color="color"
    variant="subtle"
  >
    {{ t(`account.settings.team.statuses.${status}`) }}
  </UBadge>
</template>
