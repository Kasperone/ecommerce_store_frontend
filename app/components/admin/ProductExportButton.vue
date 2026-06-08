<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Auto-imports as <AdminProductExportButton> (pathPrefix). Pass the product
// list's resolved filters so the CSV mirrors what's on screen ("export = what
// you see"). `categoryId` / `isActive` are undefined for the "all" selections.
const props = defineProps<{
  categoryId?: number
  isActive?: boolean
  search?: string
}>()

const { t } = useI18n()
const toast = useToast()
const { exportProducts, isExporting } = useExportProducts()

async function onExport() {
  const problem = await exportProducts({
    categoryId: props.categoryId,
    isActive: props.isActive,
    search: props.search,
  })
  if (problem) {
    toast.add({
      title: t('admin.products.csv.export.error'),
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
    {{ isExporting
      ? t('admin.products.csv.export.exporting')
      : t('admin.products.csv.export.button') }}
  </UButton>
</template>
