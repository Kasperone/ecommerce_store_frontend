<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const sections = ['story', 'values', 'madeIn'] as const

useSeoMeta({
  title: () => t('legal.about.meta.title'),
  description: () => t('legal.about.meta.description'),
})
</script>

<template>
  <LegalPageShell
    :title="t('legal.about.title')"
    :intro="t('legal.about.intro')"
  >
    <LegalSection
      v-for="key in sections"
      :key="key"
      :heading="t(`legal.about.sections.${key}.heading`)"
      :body-key="`legal.about.sections.${key}.body`"
    />
  </LegalPageShell>
</template>
