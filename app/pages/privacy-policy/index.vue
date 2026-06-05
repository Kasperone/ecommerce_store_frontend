<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const sections = ['controller', 'categories', 'purposes', 'recipients', 'retention', 'rights', 'cookies'] as const

useSeoMeta({
  title: () => t('legal.privacy.meta.title'),
  description: () => t('legal.privacy.meta.description'),
})
</script>

<template>
  <LegalPageShell
    :title="t('legal.privacy.title')"
    :intro="t('legal.privacy.intro')"
  >
    <LegalSection
      v-for="key in sections"
      :key="key"
      :heading="t(`legal.privacy.sections.${key}.heading`)"
      :body-key="`legal.privacy.sections.${key}.body`"
    />
  </LegalPageShell>
</template>
