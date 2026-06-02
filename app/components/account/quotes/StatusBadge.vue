<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { quoteStatusColor } from '#shared/utils/quoteStatus'
import type { QuoteStatus } from '#shared/utils/quoteStatus'

// Auto-imports as <AccountQuotesStatusBadge> (pathPrefix) — the bare name
// renders nothing. Customer-facing quote status pill; labels live under
// `account.quotes.status.*` (the admin badge uses `admin.quotes.status.*`).
const props = defineProps<{ status: QuoteStatus }>()

const { t } = useI18n()
const color = computed(() => quoteStatusColor(props.status))
</script>

<template>
  <UBadge
    :color="color"
    variant="subtle"
  >
    {{ t(`account.quotes.status.${status}`) }}
  </UBadge>
</template>
