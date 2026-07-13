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
import { brandThemeCss } from '#shared/utils/theme'

const { locale } = useI18n()

// Brand name from the admin-editable store_config (SSR-serialized, empty-safe)
// drives the document <title> suffix so a rebrand needs no code change.
const { data: storeConfig } = useStoreConfig()
const brandName = computed(() => storeConfig.value?.store_name?.trim() || 'E-commerce Store')

// Runtime brand theme (brand program B4+C): if the admin configured a
// primary_color, generate the full Nuxt UI primary ramp from it and inject it
// as an UNLAYERED inline <style> — unlayered wins over Nuxt UI's @layer theme,
// and main.css's --ui-primary step mappings (700 light / 400 dark, incl. the
// WCAG remap) consume the ramp unchanged. SSR-rendered from the serialized
// store-config payload, so there is no flash of the default theme.
const brandTheme = computed(() => brandThemeCss(storeConfig.value?.primary_color?.trim() ?? ''))

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
  style: brandTheme.value ? [{ innerHTML: brandTheme.value, id: 'brand-theme' }] : [],
}))

// Site-wide og:image fallback (SEO blueprint SEO-1.4 / D9): no URL ever
// shares imageless. Page-level useSeoMeta ogImage (PDP photo, category hero,
// CMS seo_image_url) overrides this via head dedupe; absolute URL built from
// the canonical site origin since og:image must be fully qualified.
const site = useSiteConfig()
useSeoMeta({
  ogImage: `${site.url}/social-share.png`,
  ogSiteName: () => brandName.value,
})

// Site-wide structured data (SEO blueprint SEO-1.1 / D6). Identity lives here
// rather than nuxt.config because every value is runtime data from the
// admin-editable store_config (brand SoT). nuxt-schema-org auto-adds linked
// WebSite + WebPage nodes per page (per-locale, no SearchAction — the
// sitelinks search box is dead since Nov 2024) and renders during SSR only.
const sameAs = computed(() =>
  [
    storeConfig.value?.social_instagram,
    storeConfig.value?.social_facebook,
    storeConfig.value?.social_tiktok,
    storeConfig.value?.social_youtube,
  ].filter((url): url is string => !!url?.trim()),
)

const postalAddress = computed(() => {
  const cfg = storeConfig.value
  if (!cfg?.address_line?.trim()) return undefined
  return {
    '@type': 'PostalAddress',
    'streetAddress': [cfg.address_line, cfg.address_line2].filter(s => s?.trim()).join(', '),
    'addressLocality': cfg.postal_city?.trim() || undefined,
    'addressCountry': cfg.country?.trim() || undefined,
  }
})

useSchemaOrg([
  defineOrganization({
    // String shorthand can't express sub-types; OnlineStore is the commerce
    // signal AI/shopping surfaces look for.
    '@type': ['Organization', 'OnlineStore'],
    'name': () => brandName.value,
    'logo': () => storeConfig.value?.logo_url?.trim() || undefined,
    'email': () => storeConfig.value?.email?.trim() || undefined,
    'telephone': () => storeConfig.value?.phone?.trim() || undefined,
    'address': () => postalAddress.value,
    'sameAs': () => (sameAs.value.length ? sameAs.value : undefined),
    // Nov-2025 Google change: declare the returns policy ONCE at Organization
    // level instead of per-Offer. Values mirror the /returns legal page
    // (EU 14-day right of withdrawal, customer bears the return shipping) —
    // markup must match on-page reality. PL + US = the two storefront-locale
    // markets. hasShippingService is intentionally absent: shipping rates are
    // zone/weight-dynamic, declared later with the merchant feeds (Phase 5).
    'hasMerchantReturnPolicy': {
      '@type': 'MerchantReturnPolicy',
      'applicableCountry': ['PL', 'US'],
      'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
      'merchantReturnDays': 14,
      'returnMethod': 'https://schema.org/ReturnByMail',
      'returnFees': 'https://schema.org/ReturnFeesCustomerResponsibility',
    },
  }),
  // Explicit WebSite node so its name follows the store_config brand instead
  // of the static site.name fallback. Dedupes by @id with the auto-added node.
  defineWebSite({
    name: () => brandName.value,
  }),
])
</script>
