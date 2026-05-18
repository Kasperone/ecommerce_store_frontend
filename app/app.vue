<template>
  <UApp :locale="uiLocale">
    <NuxtPage />
  </UApp>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHead } from '#imports'
import * as uiLocales from '@nuxt/ui/locale'

const { locale } = useI18n()

const uiLocale = computed(() => {
  // map string locale (e.g. 'en' or 'pl') to the nuxt ui locale object; fallback to en
  const key = locale.value as keyof typeof uiLocales
  return uiLocales[key] ?? uiLocales.en
})

// Update html lang/dir based on nuxt ui locale
const lang = computed(() => uiLocale.value?.code ?? locale.value)
const dir = computed(() => uiLocale.value?.dir ?? 'ltr')

useHead({
  titleTemplate: '%s | E-commerce Store',
  htmlAttrs: {
    lang,
    dir,
  },
})
</script>
