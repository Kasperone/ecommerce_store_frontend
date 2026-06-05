<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AccordionItem } from '@nuxt/ui'

const { t } = useI18n()

const itemKeys = [
  'orderTrack',
  'shippingTime',
  'returnPolicy',
  'payments',
  'currency',
  'account',
  'business',
] as const

const items = computed<AccordionItem[]>(() =>
  itemKeys.map(key => ({
    label: t(`legal.faq.items.${key}.question`),
    content: t(`legal.faq.items.${key}.answer`),
  })),
)

useSeoMeta({
  title: () => t('legal.faq.meta.title'),
  description: () => t('legal.faq.meta.description'),
})
</script>

<template>
  <LegalPageShell
    :title="t('legal.faq.title')"
    :intro="t('legal.faq.intro')"
  >
    <UAccordion :items="items" />
  </LegalPageShell>
</template>
