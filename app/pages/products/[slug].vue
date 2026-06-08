<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProductVariantPublic } from '#shared/types/api'
import { localizedCategoryName } from '#shared/utils/categoryTree'
import {
  localizedProductDescription,
  localizedProductMetaDescription,
  localizedProductMetaTitle,
  localizedProductName,
} from '#shared/utils/localizedProduct'
import { defaultCurrencyForLocale, selectPrice } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const slug = route.params.slug as string

const { data: product, error } = await useProductDetail(slug)

// A missing slug (or any fetch failure) becomes a proper error page rather than
// an empty shell — 404 for not-found, the upstream status otherwise (incl. the
// backend's 410 Gone for deactivated products).
if (error.value) {
  throw createError({
    statusCode: parseProblem(error.value)?.status ?? 404,
    statusMessage: t('pdp.loadError'),
    fatal: true,
  })
}

// Page-1 reviews, SSR'd at page level for the JSON-LD aggregateRating/review
// nodes. Shares its useAsyncData key with <ShopProductReviews>, so this is the
// same single fetch the review section below renders from — markup and visible
// content can't drift apart.
const { data: reviews } = await useProductReviews(product.value!.id)

const displayName = computed(() =>
  product.value ? localizedProductName(product.value, locale.value) : '',
)
const displayDescription = computed(() =>
  product.value ? localizedProductDescription(product.value, locale.value) : null,
)
const metaTitle = computed(() =>
  product.value ? localizedProductMetaTitle(product.value, locale.value) : '',
)
const metaDescription = computed(() =>
  product.value ? localizedProductMetaDescription(product.value, locale.value) : null,
)
const firstImage = computed(() => product.value?.images?.[0] ?? null)

useSeoMeta({
  // Admin-set meta fields win; fall back to the localized name/description.
  title: () => metaTitle.value,
  description: () => metaDescription.value ?? '',
  ogTitle: () => displayName.value,
  ogDescription: () => metaDescription.value ?? '',
  // Real R2 product photo (absolute URL) — beats a generated card for products
  // (SEO blueprint D9). Images arrive sorted by sort_order; [0] is the primary.
  ogImage: () => firstImage.value?.url,
  ogImageAlt: () => firstImage.value?.alt_text ?? displayName.value,
  twitterCard: 'summary_large_image',
})

// ---------------------------------------------------------------------------
// Variants (F2). The selector resolves the shopper's option picks into a
// variant; until then `selectedVariant` is null and the aggregate product
// numbers (stock = sum across variants, base "from" price) drive the page.
// ---------------------------------------------------------------------------
const selectedVariant = ref<ProductVariantPublic | null>(null)
const variants = computed(() => product.value?.variants ?? [])
const hasVariants = computed(
  () => product.value?.has_variants === true && variants.value.length > 0,
)

// Stock grain follows the selection: the variant's stock when one is resolved,
// else the product's (the maintained sum for variant products).
const effectiveStock = computed(() =>
  selectedVariant.value ? selectedVariant.value.stock : product.value?.stock ?? 0,
)

// A backorderable product at zero stock is "on backorder", not "out of stock".
const backorder = computed(
  () => effectiveStock.value <= 0 && product.value?.allow_backorder === true,
)
const outOfStock = computed(
  () => effectiveStock.value <= 0 && !backorder.value,
)
const lowStock = computed(() => {
  const p = product.value
  if (!p || effectiveStock.value <= 0 || p.low_stock_threshold == null) return false
  return effectiveStock.value <= p.low_stock_threshold
})

// Variant SKU wins once resolved; falls back to the product SKU.
const displaySku = computed(() => selectedVariant.value?.sku ?? product.value?.sku ?? null)

const category = computed(() => product.value?.category ?? null)
const categoryTo = computed(() =>
  category.value ? localePath(`/category/${category.value.slug}`) : null,
)

// ---------------------------------------------------------------------------
// Structured data (SEO blueprint SEO-1.2 / D6) — exactly ONE Product node.
//
// D4 (currency): the Offer's price/priceCurrency derive from the URL locale's
// default currency (EN→USD, /pl/→PLN), NEVER the shopper's currency cookie —
// JSON-LD renders during SSR and must be deterministic per URL (a cookie-less
// crawler sees exactly this price on the page). The client-side currency
// switcher reconciles the VISIBLE price after hydration but never rewrites
// JSON-LD (schemaOrg.reactive is off).
// ---------------------------------------------------------------------------
const schemaPrice = computed(() =>
  product.value ? selectPrice(product.value, defaultCurrencyForLocale(locale.value)) : null,
)

// Canonical site origin (nuxt-site-config; env-overridable NUXT_PUBLIC_SITE_URL).
const { url: siteUrl } = useSiteConfig()

// og:type=product + product:price:* aren't in useSeoMeta's typed surface;
// still consumed by Pinterest Rich Pins and some agents (harmless otherwise).
useHead(() => ({
  meta: [
    { property: 'og:type', content: 'product' },
    ...(schemaPrice.value
      ? [
          { property: 'product:price:amount', content: String(schemaPrice.value.amount) },
          { property: 'product:price:currency', content: schemaPrice.value.currency },
        ]
      : []),
  ],
}))

// schema.org availability — OutOfStock stays a 200/indexed page (D12).
const schemaAvailability = computed(() => {
  if (outOfStock.value) return 'https://schema.org/OutOfStock'
  if (backorder.value) return 'https://schema.org/BackOrder'
  return 'https://schema.org/InStock'
})

const CONDITION_SCHEMA: Record<string, string> = {
  new: 'https://schema.org/NewCondition',
  refurbished: 'https://schema.org/RefurbishedCondition',
  used: 'https://schema.org/UsedCondition',
}

const reviewSummary = computed(() => reviews.value?.summary ?? null)

// Variant products emit an AggregateOffer (lowPrice/highPrice across the
// ACTIVE variants' effective prices in the URL locale's currency — D4 applies
// unchanged) instead of the single Offer. Availability mirrors the visible
// badge: product.stock is the maintained sum, so "any variant in stock" ⟺
// `schemaAvailability` at SSR time (no variant selected yet).
const variantOfferPrices = computed(() => {
  const code = defaultCurrencyForLocale(locale.value)
  return variants.value
    .map(variant => selectPrice(variant, code))
    .filter((picked): picked is NonNullable<typeof picked> => picked != null)
})

const offerUrl = () => `${siteUrl}${localePath(`/products/${slug}`)}`

const schemaOffers
  = hasVariants.value && variantOfferPrices.value.length > 0
    ? [
        defineAggregateOffer({
          lowPrice: () => Math.min(...variantOfferPrices.value.map(p => p.amount)),
          highPrice: () => Math.max(...variantOfferPrices.value.map(p => p.amount)),
          priceCurrency: () => variantOfferPrices.value[0]!.currency,
          offerCount: () => variantOfferPrices.value.length,
          availability: () => schemaAvailability.value,
          url: offerUrl,
        }),
      ]
    : [{
        price: () => schemaPrice.value?.amount,
        priceCurrency: () => schemaPrice.value?.currency,
        availability: () => schemaAvailability.value,
        itemCondition: () =>
          CONDITION_SCHEMA[product.value?.condition ?? 'new'] ?? CONDITION_SCHEMA.new,
        // The module doesn't absolutize Offer.url (verified) — build it from the
        // canonical site origin + the LOCALE path: each locale page is its own
        // offer URL (EN/USD vs /pl/PLN — distinct URL per currency, D4).
        url: offerUrl,
      }]

useSchemaOrg([
  defineProduct({
    name: () => displayName.value,
    description: () => displayDescription.value ?? undefined,
    image: () => (product.value?.images?.length ? product.value.images.map(i => i.url) : undefined),
    sku: () => product.value?.sku ?? undefined,
    // brand falls back to the Organization identity when unset (module default).
    brand: () => (product.value?.brand ? { name: product.value.brand } : undefined),
    gtin: () => product.value?.gtin ?? undefined,
    mpn: () => product.value?.mpn ?? undefined,
    offers: schemaOffers,
    // Real first-party PDP reviews ARE eligible for review stars (the
    // self-serving ban only hits Organization/LocalBusiness). Only emitted
    // when reviews exist — markup must match the visible review section.
    aggregateRating: () =>
      reviewSummary.value && reviewSummary.value.total > 0
        ? {
            ratingValue: reviewSummary.value.average_rating,
            ratingCount: reviewSummary.value.total,
          }
        : undefined,
    review: () =>
      reviews.value?.items?.length
        ? reviews.value.items.map(r => ({
            name: r.title ?? undefined,
            reviewBody: r.body,
            datePublished: r.created_at,
            author: { name: r.author_name },
            reviewRating: { ratingValue: r.rating },
          }))
        : undefined,
  }),
  // Mirrors the visible breadcrumb nav below (last item carries no `item`).
  defineBreadcrumb({
    itemListElement: () => [
      { name: t('navigation.products'), item: localePath('/products') },
      ...(category.value && categoryTo.value
        ? [{ name: localizedCategoryName(category.value, locale.value), item: categoryTo.value }]
        : []),
      { name: displayName.value },
    ],
  }),
])
</script>

<template>
  <NuxtLayout>
    <div
      v-if="product"
      class="mx-auto w-full max-w-7xl px-4 py-8"
    >
      <nav class="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <NuxtLink
          :to="localePath('/products')"
          class="hover:text-primary"
        >
          {{ t('navigation.products') }}
        </NuxtLink>
        <template v-if="category && categoryTo">
          <span>/</span>
          <NuxtLink
            :to="categoryTo"
            class="hover:text-primary"
          >
            {{ localizedCategoryName(category, locale) }}
          </NuxtLink>
        </template>
        <span>/</span>
        <span class="font-medium text-highlighted">{{ displayName }}</span>
      </nav>

      <div class="grid gap-8 lg:grid-cols-2">
        <ShopProductGallery
          :images="product.images"
          :name="displayName"
          :active-image-id="selectedVariant?.image_id ?? null"
        />

        <div class="flex flex-col gap-4">
          <h1 class="text-3xl font-bold">
            {{ displayName }}
          </h1>

          <div>
            <ShopPriceDisplay
              :product="product"
              :variant="selectedVariant"
              size="lg"
            />
            <ShopOmnibusPrice
              :product="product"
              :variant="selectedVariant"
              :variant-id="selectedVariant?.id ?? null"
            />
          </div>

          <ShopVariantSelector
            v-if="hasVariants"
            v-model="selectedVariant"
            :options="product.options ?? []"
            :variants="variants"
            :allow-backorder="product.allow_backorder"
          />

          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              v-if="outOfStock"
              color="neutral"
              variant="subtle"
            >
              {{ t('stock.outOfStock') }}
            </UBadge>
            <UBadge
              v-else-if="backorder"
              color="info"
              variant="subtle"
            >
              {{ t('stock.backorder') }}
            </UBadge>
            <UBadge
              v-else-if="lowStock"
              color="warning"
              variant="subtle"
            >
              {{ t('stock.lowStock', { count: effectiveStock }) }}
            </UBadge>
            <UBadge
              v-else
              color="success"
              variant="subtle"
            >
              {{ t('stock.inStock') }}
            </UBadge>
            <span
              v-if="displaySku"
              class="text-sm text-muted"
            >{{ t('details.sku') }}: {{ displaySku }}</span>
          </div>

          <div class="flex max-w-md items-stretch gap-2">
            <ShopAddToCartButton
              :product="product"
              :variant="selectedVariant"
              block
              class="flex-1"
            />
            <ShopWishlistButton
              :product="product"
              :variant="selectedVariant"
              icon-only
            />
          </div>

          <div
            v-if="displayDescription"
            class="mt-4"
          >
            <h2 class="mb-2 text-lg font-semibold">
              {{ t('details.description') }}
            </h2>
            <p class="whitespace-pre-line text-muted">
              {{ displayDescription }}
            </p>
          </div>
        </div>
      </div>

      <ShopProductReviews :product-id="product.id" />

      <!-- "You may also like" — client-only (Colada isn't SSR-serialized) and
           self-hides when there's no related signal. -->
      <ClientOnly>
        <ShopRelatedProducts :slug="slug" />
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
