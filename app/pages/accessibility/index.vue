<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const sections = ['conformance', 'limitations', 'feedback', 'enforcement'] as const

useSeoMeta({
  title: () => t('legal.accessibility.meta.title'),
  description: () => t('legal.accessibility.meta.description'),
})
</script>

<template>
  <LegalPageShell
    :title="t('legal.accessibility.title')"
    :intro="t('legal.accessibility.intro')"
  >
    <LegalSection
      v-for="key in sections"
      :key="key"
      :heading="t(`legal.accessibility.sections.${key}.heading`)"
      :body-key="`legal.accessibility.sections.${key}.body`"
    />
  </LegalPageShell>
</template>
