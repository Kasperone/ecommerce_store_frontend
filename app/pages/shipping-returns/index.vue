<script setup lang="ts">
const { t } = useI18n()
useHead({ title: t('footer.columns.help.shippingReturns') })
</script>

<template>
  <UContainer class="py-16">
    <h1 class="text-3xl font-semibold mb-4">{{ t('footer.columns.help.shippingReturns') }}</h1>
    <p class="text-muted">{{ t('footer.stubPage.comingSoon') }}</p>
    <ULink to="/" class="mt-6 inline-block text-primary">← {{ t('footer.stubPage.backHome') }}</ULink>
  </UContainer>
</template>
