<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Auto-imports as <AdminReportExportButton> (pathPrefix). Pass the reports page's
// resolved range + granularity so the CSV mirrors what's on screen ("export = what
// you filter"). The endpoint requires start+end, so the button is disabled until
// both are present.
const props = defineProps<{
  start?: string
  end?: string
  granularity: 'day' | 'week' | 'month'
}>()

const { t } = useI18n()
const toast = useToast()
const { exportSalesReport, isExporting } = useExportSalesReport()

const disabled = computed(() => !props.start || !props.end)

async function onExport() {
  if (disabled.value) return
  const problem = await exportSalesReport({
    start: props.start,
    end: props.end,
    granularity: props.granularity,
  })
  if (problem) {
    toast.add({
      title: t('admin.reports.export.error'),
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
    :disabled="disabled"
    @click="onExport"
  >
    {{ isExporting ? t('admin.reports.export.exporting') : t('admin.reports.export.button') }}
  </UButton>
</template>
