<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OrderStatus } from '#shared/types/api'
import { statusColor } from '#shared/utils/orderStatus'

const props = defineProps<{ status: OrderStatus }>()

const { t } = useI18n()
const color = computed(() => statusColor(props.status))
</script>

<template>
  <UBadge
    :color="color"
    variant="subtle"
  >
    {{ t(`orders.status.${status}`) }}
  </UBadge>
</template>
