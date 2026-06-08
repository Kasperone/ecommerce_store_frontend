<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Auto-imports as <AdminInventoryLowStockReportButton> (pathPrefix). Triggers
// the best-effort low-stock digest email to the store admin and toasts the
// resolved recipients + product count. No validatable fields, so we use the
// gold-flow's message+toast-only shape (`useValidatedForm(ref(null))`).
const { t } = useI18n()
const toast = useToast()
const emailReport = useEmailLowStockReport()

const { applyApiError } = useValidatedForm(ref(null), {
  toast,
  t,
  toastTitleKey: 'admin.inventory.lowStock.report.errorTitle',
})

async function onSend() {
  try {
    const result = await emailReport.mutateAsync()
    toast.add({
      title: t('admin.inventory.lowStock.report.successTitle'),
      description: t(
        'admin.inventory.lowStock.report.success',
        { count: result.product_count, recipients: result.recipients.join(', ') },
        result.product_count,
      ),
      color: 'success',
      icon: 'i-lucide-mail-check',
    })
  }
  catch (err) {
    applyApiError(err, t('admin.inventory.lowStock.report.error'))
  }
}
</script>

<template>
  <UButton
    color="neutral"
    variant="soft"
    icon="i-lucide-mail"
    :loading="emailReport.isLoading.value"
    @click="onSend"
  >
    {{ t('admin.inventory.lowStock.report.button') }}
  </UButton>
</template>
