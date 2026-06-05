<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const sections = ['seller', 'scope', 'orders', 'delivery', 'withdrawal', 'complaints', 'dispute', 'misc'] as const

useSeoMeta({
  title: () => t('legal.terms.meta.title'),
  description: () => t('legal.terms.meta.description'),
})
</script>

<template>
  <LegalPageShell
    :title="t('legal.terms.title')"
    :intro="t('legal.terms.intro')"
  >
    <LegalSection
      v-for="key in sections"
      :key="key"
      :heading="t(`legal.terms.sections.${key}.heading`)"
      :body-key="`legal.terms.sections.${key}.body`"
    />
  </LegalPageShell>
</template>
