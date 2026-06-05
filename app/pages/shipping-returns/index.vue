<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const sections = ['methods', 'times', 'costs', 'tracking'] as const

useSeoMeta({
  title: () => t('legal.shipping.meta.title'),
  description: () => t('legal.shipping.meta.description'),
})
</script>

<template>
  <LegalPageShell
    :title="t('legal.shipping.title')"
    :intro="t('legal.shipping.intro')"
  >
    <LegalSection
      v-for="key in sections"
      :key="key"
      :heading="t(`legal.shipping.sections.${key}.heading`)"
      :body-key="`legal.shipping.sections.${key}.body`"
    />
  </LegalPageShell>
</template>
