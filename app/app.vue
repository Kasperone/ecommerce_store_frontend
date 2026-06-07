<template>
  <UApp :locale="uiLocale">
    <ImpersonationBanner />
    <NuxtPage />
  </UApp>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHead } from '#imports'
import * as uiLocales from '@nuxt/ui/locale'

const { locale } = useI18n()

// Brand name from the admin-editable store_config (SSR-serialized, empty-safe)
// drives the document <title> suffix so a rebrand needs no code change.
const { data: storeConfig } = useStoreConfig()
const brandName = computed(() => storeConfig.value?.store_name?.trim() || 'E-commerce Store')

const uiLocale = computed(() => {
  // map string locale (e.g. 'en' or 'pl') to the nuxt ui locale object; fallback to en
  const key = locale.value as keyof typeof uiLocales
  return uiLocales[key] ?? uiLocales.en
})

// Update html lang/dir based on nuxt ui locale
const lang = computed(() => uiLocale.value?.code ?? locale.value)
const dir = computed(() => uiLocale.value?.dir ?? 'ltr')

// i18n SEO head (manual wiring — v10 applies nothing automatically): emits the
// self-referencing canonical, hreflang alternates (en-US / pl-PL / x-default →
// the unprefixed EN page), and og:locale(:alternate) on every page. Canonicals
// keep ONLY `?page` so paginated pages stay self-canonical while filter/sort/
// tracking params are stripped (SEO blueprint D3). Absolute URLs come from
// i18n.baseUrl in nuxt.config.ts.
const i18nHead = useLocaleHead({ seo: { canonicalQueries: ['page'] } })

useHead(() => ({
  titleTemplate: (title?: string) => (title ? `${title} | ${brandName.value}` : brandName.value),
  htmlAttrs: {
    lang: lang.value,
    dir: dir.value,
  },
  link: [...(i18nHead.value.link ?? [])],
  meta: [...(i18nHead.value.meta ?? [])],
}))
</script>
