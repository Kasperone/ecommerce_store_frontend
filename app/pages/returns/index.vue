<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const sections = ['withdrawal', 'how', 'condition', 'refunds', 'exceptions'] as const

useSeoMeta({
  title: () => t('legal.returns.meta.title'),
  description: () => t('legal.returns.meta.description'),
})
</script>

<template>
  <LegalPageShell
    :title="t('legal.returns.title')"
    :intro="t('legal.returns.intro')"
  >
    <LegalSection
      v-for="key in sections"
      :key="key"
      :heading="t(`legal.returns.sections.${key}.heading`)"
      :body-key="`legal.returns.sections.${key}.body`"
    />
  </LegalPageShell>
</template>
