<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Auto-imports as <AccountQuotesDownloadButton> (pathPrefix) — the bare name
// renders nothing. Mirrors <OrdersInvoiceDownloadButton> for the quote PDF.
const props = withDefaults(defineProps<{
  quoteId: number
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>(), { size: 'md' })

const { t, locale } = useI18n()
const toast = useToast()
const { download, isDownloading } = useDownloadQuote()

async function onDownload() {
  const problem = await download(props.quoteId, locale.value)
  if (problem) {
    toast.add({
      title: t('account.quotes.pdf.error'),
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
    {{ t('account.quotes.pdf.download') }}
  </UButton>
</template>
