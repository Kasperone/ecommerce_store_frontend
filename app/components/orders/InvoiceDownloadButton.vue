<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Shared by the admin order-detail and customer order-detail pages. Auto-imports
// as <OrdersInvoiceDownloadButton> (pathPrefix) — the bare name renders nothing.
const props = withDefaults(defineProps<{
  orderId: number
  orderNumber: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>(), { size: 'md' })

const { t, locale } = useI18n()
const toast = useToast()
const { download, isDownloading } = useDownloadInvoice()

async function onDownload() {
  const problem = await download(props.orderId, props.orderNumber, locale.value)
  if (problem) {
    toast.add({
      title: t('orders.invoice.error'),
      description: problem.detail,
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
}
</script>

<template>
  <UButton
    :size="size"
    color="neutral"
    variant="soft"
    icon="i-lucide-download"
    :loading="isDownloading"
    @click="onDownload"
  >
    {{ t('orders.invoice.download') }}
  </UButton>
</template>
