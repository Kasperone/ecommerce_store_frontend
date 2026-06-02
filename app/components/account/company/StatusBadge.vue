<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompanyMe } from '~/composables/queries/useCompany'

/**
 * Small status pill for a B2B company's approval state
 * (`pending` | `approved` | `rejected`). Read-only display.
 */

const props = defineProps<{
  status: CompanyMe['status']
}>()

const { t } = useI18n()

const color = computed(() => {
  switch (props.status) {
    case 'approved': return 'success' as const
    case 'rejected': return 'error' as const
    default: return 'neutral' as const
  }
})
</script>

<template>
  <UBadge
    :color="color"
    variant="subtle"
  >
    {{ t(`account.settings.company.status.${status}`) }}
  </UBadge>
</template>
