<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Auto-imports as <AdminInventoryExportButton> (pathPrefix). Pass the inventory
// list's resolved filters so the CSV mirrors what's on screen ("export = what you
// see"). `status` is undefined for the "all" selection.
const props = defineProps<{
  status?: string
  search?: string
}>()

const { t } = useI18n()
const toast = useToast()
const { exportInventory, isExporting } = useExportInventory()

async function onExport() {
  const problem = await exportInventory({ status: props.status, search: props.search })
  if (problem) {
    toast.add({
      title: t('admin.inventory.export.error'),
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
    {{ isExporting ? t('admin.inventory.export.exporting') : t('admin.inventory.export.button') }}
  </UButton>
</template>
