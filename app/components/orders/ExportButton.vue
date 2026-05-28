<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Auto-imports as <OrdersExportButton> (pathPrefix) — the bare name renders nothing.
// Pass the orders list's *resolved* filters so the CSV mirrors what's on screen
// ("export = what you see"). `status` is undefined for the "all" selection.
const props = defineProps<{
  status?: string
  dateFrom?: string
  dateTo?: string
}>()

const { t } = useI18n()
const toast = useToast()
const { exportOrders, isExporting } = useExportOrders()

async function onExport() {
  const problem = await exportOrders({
    status: props.status,
    dateFrom: props.dateFrom,
    dateTo: props.dateTo,
  })
  if (problem) {
    toast.add({
      title: t('admin.orders.export.error'),
      description: problem.detail,
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
}
</script>

<template>
  <UButton
    color="neutral"
    variant="soft"
    icon="i-lucide-download"
    :loading="isExporting"
    @click="onExport"
  >
    {{ isExporting ? t('admin.orders.export.exporting') : t('admin.orders.export.button') }}
  </UButton>
</template>
