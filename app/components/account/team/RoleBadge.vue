<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { companyRoleColor } from '~/composables/queries/useTeam'
import type { CompanyRole } from '~/composables/queries/useTeam'

// Auto-imports as <AccountTeamRoleBadge> (pathPrefix) — the bare name renders
// nothing. Labels live under `account.settings.team.roles.*`.
const props = defineProps<{ role: CompanyRole }>()

const { t } = useI18n()
const color = computed(() => companyRoleColor(props.role))
</script>

<template>
  <UBadge
    :color="color"
    variant="subtle"
  >
    {{ t(`account.settings.team.roles.${role}`) }}
  </UBadge>
</template>
