<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery } from '@vueuse/core'
import { z } from 'zod'
import type { components } from '#shared/types/api.gen'

type NewsletterSubscribeRequest = components['schemas']['NewsletterSubscribeRequest']
type NewsletterSubscribeResponse = components['schemas']['NewsletterSubscribeResponse']

const { t, locale, setLocale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { apiFetch } = useApi()
const { openSettings } = useCookieConsent()

const year = new Date().getFullYear()

// Public store-config (legal-name / address / NIP-REGON-KRS / contact / socials).
// useAsyncData (public read) — empty-safe: null hides the company block + socials.
const { data: storeConfig } = useStoreConfig()

/**
 * US-visitor gate for the CCPA/CPRA "Do Not Sell or Share My Personal
 * Information" link. No geo/IP signal exists in this storefront yet, so this is
 * a documented stub that returns `false` by default — the link stays hidden.
 *
 * TODO: wire to a real geo/CloudFront-country / IP-geolocation signal (or a
 * user region preference) so the link conditionally renders for US/CA visitors,
 * then point it at a dedicated opt-out webform once that exists.
 */
function useUsVisitor() {
  return computed(() => false)
}
const isUsVisitor = useUsVisitor()

// ---------------------------------------------------------------------------
// Mobile accordion behaviour for the link columns.
//
// SSR + the first client render keep every <details> OPEN so the markup is
// identical across hydration (no mismatch) and every link is crawlable. On the
// client after mount, narrow viewports collapse the columns into accordions;
// `lg` (≥1024px) stays open with an inert summary. `isDesktop` is false on the
// server (useMediaQuery SSR-safe), but we only consult it post-mount via
// `mounted`, so the initial paint can't disagree with the server.
// ---------------------------------------------------------------------------
const isDesktop = useMediaQuery('(min-width: 1024px)')
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
// A column is open when: not yet mounted (SSR/first paint) OR desktop. On mobile
// post-mount, the native <details> toggle takes over (uncontrolled) — we only
// seed the initial collapsed state.
const columnsOpen = computed(() => !mounted.value || isDesktop.value)

// ---------------------------------------------------------------------------
// Language switcher (mirrors the header's setLocale toggle).
// ---------------------------------------------------------------------------
function toggleLocale() {
  void setLocale(locale.value === 'pl' ? 'en' : 'pl')
}

// ---------------------------------------------------------------------------
// Newsletter — real backend POST + a marketing-consent checkbox.
// ---------------------------------------------------------------------------
const email = ref('')
const consent = ref(false)
const error = ref<string | null>(null)
const submitting = ref(false)

const newsletterSchema = z.object({
  email: z.string().email(),
})

async function onNewsletterSubmit() {
  error.value = null

  const result = newsletterSchema.safeParse({ email: email.value })
  if (!result.success) {
    error.value = t('footer.newsletter.invalidEmail')
    return
  }
  if (!consent.value) {
    error.value = t('footer.newsletter.consentRequired')
    return
  }

  submitting.value = true
  try {
    const body: NewsletterSubscribeRequest = { email: email.value }
    await apiFetch<NewsletterSubscribeResponse>('/api/v1/newsletter/subscribe', {
      method: 'POST',
      body,
    })
    toast.add({ title: t('footer.newsletter.success'), color: 'success' })
    email.value = ''
    consent.value = false
  }
  catch {
    toast.add({ title: t('footer.newsletter.errorTitle'), color: 'error' })
  }
  finally {
    submitting.value = false
  }
}

// ---------------------------------------------------------------------------
// Link columns. Every `to` runs through localePath (prefix_except_default).
// ---------------------------------------------------------------------------
interface LinkItem {
  labelKey: string
  to: string
}
interface ActionItem {
  labelKey: string
  action: 'cookieSettings'
}
type ColumnItem = LinkItem | ActionItem

interface LinkColumn {
  key: string
  headingKey: string
  items: ColumnItem[]
}

function isAction(item: ColumnItem): item is ActionItem {
  return 'action' in item
}

const linkColumns = computed<LinkColumn[]>(() => [
  {
    key: 'shop',
    headingKey: 'footer.columns.shop.heading',
    items: [
      { labelKey: 'footer.columns.shop.products', to: '/products' },
      { labelKey: 'footer.columns.shop.newArrivals', to: '/products' },
      { labelKey: 'footer.columns.shop.bestsellers', to: '/products' },
      { labelKey: 'footer.columns.shop.deals', to: '/products' },
    ],
  },
  {
    key: 'help',
    headingKey: 'footer.columns.help.heading',
    items: [
      { labelKey: 'footer.columns.help.contact', to: '/contact' },
      { labelKey: 'footer.columns.help.faq', to: '/faq' },
      { labelKey: 'footer.columns.help.returns', to: '/returns' },
      { labelKey: 'footer.columns.help.shipping', to: '/shipping-returns' },
      { labelKey: 'footer.columns.help.trackOrder', to: '/account/orders' },
    ],
  },
  {
    key: 'about',
    headingKey: 'footer.columns.about.heading',
    items: [
      { labelKey: 'footer.columns.about.about', to: '/about' },
      { labelKey: 'footer.columns.about.careers', to: '/about' },
      { labelKey: 'footer.columns.about.press', to: '/about' },
    ],
  },
  {
    key: 'account',
    headingKey: 'footer.columns.account.heading',
    items: [
      { labelKey: 'footer.columns.account.signIn', to: '/login' },
      { labelKey: 'footer.columns.account.register', to: '/sign-up' },
      { labelKey: 'footer.columns.account.myAccount', to: '/account' },
      { labelKey: 'footer.columns.account.orders', to: '/account/orders' },
    ],
  },
  {
    key: 'legal',
    headingKey: 'footer.columns.legal.heading',
    items: [
      { labelKey: 'footer.columns.legal.terms', to: '/terms-of-service' },
      { labelKey: 'footer.columns.legal.privacy', to: '/privacy-policy' },
      { labelKey: 'footer.columns.legal.cookiePolicy', to: '/cookie-policy' },
      { labelKey: 'footer.columns.legal.cookieSettings', action: 'cookieSettings' },
      { labelKey: 'footer.columns.legal.withdrawal', to: '/returns' },
      { labelKey: 'footer.columns.legal.accessibility', to: '/accessibility' },
    ],
  },
])

// ---------------------------------------------------------------------------
// Socials — wired from store-config; a social with no URL is hidden.
// ---------------------------------------------------------------------------
interface SocialLink {
  name: string
  icon: string
  labelKey: string
  url: string
}
const socials = computed<SocialLink[]>(() => {
  const cfg = storeConfig.value
  if (!cfg) return []
  return [
    { name: 'instagram', icon: 'i-simple-icons-instagram', labelKey: 'footer.social.instagram', url: cfg.social_instagram },
    { name: 'facebook', icon: 'i-simple-icons-facebook', labelKey: 'footer.social.facebook', url: cfg.social_facebook },
    { name: 'tiktok', icon: 'i-simple-icons-tiktok', labelKey: 'footer.social.tiktok', url: cfg.social_tiktok },
    { name: 'youtube', icon: 'i-simple-icons-youtube', labelKey: 'footer.social.youtube', url: cfg.social_youtube },
  ].filter(s => s.url && s.url.trim().length > 0)
})

// ---------------------------------------------------------------------------
// Company-identification block (legal name / address / NIP-REGON-KRS / contact).
// Rendered only when store-config provides at least a legal name.
// ---------------------------------------------------------------------------
const company = computed(() => storeConfig.value)
const hasCompanyBlock = computed(() => !!company.value?.legal_name?.trim())

// ---------------------------------------------------------------------------
// Trust strip + payment icons.
// ---------------------------------------------------------------------------
interface PaymentMethod {
  name: string
  icon?: string
  text?: string
}
const paymentMethods: PaymentMethod[] = [
  { name: 'Visa', icon: 'i-simple-icons-visa' },
  { name: 'Mastercard', icon: 'i-simple-icons-mastercard' },
  { name: 'Stripe', icon: 'i-simple-icons-stripe' },
  { name: 'PayU', text: 'PayU' },
  { name: 'BLIK', text: 'BLIK' },
  { name: 'Przelewy24', text: 'P24' },
]
</script>

<template>
  <UFooter class="c-footer">
    <template #top>
      <UContainer class="py-10">
        <!-- Trust strip -->
        <div
          class="flex flex-col items-center gap-4 pb-8 sm:flex-row sm:justify-between"
        >
          <div
            :aria-label="t('footer.payment.heading')"
            class="flex flex-wrap items-center justify-center gap-2 text-muted"
          >
            <template
              v-for="p in paymentMethods"
              :key="p.name"
            >
              <UIcon
                v-if="p.icon"
                :name="p.icon"
                :aria-label="p.name"
                role="img"
                class="text-2xl"
              />
              <span
                v-else
                :aria-label="p.name"
                role="img"
                class="rounded border border-current px-1.5 py-0.5 text-xs font-bold tracking-tight"
              >{{ p.text }}</span>
            </template>
          </div>
          <ul class="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-muted">
            <li class="flex items-center gap-1.5">
              <UIcon
                name="i-lucide-shield-check"
                class="text-success"
                aria-hidden="true"
              />
              {{ t('footer.trust.secureCheckout') }}
            </li>
            <li class="flex items-center gap-1.5">
              <UIcon
                name="i-lucide-rotate-ccw"
                class="text-primary"
                aria-hidden="true"
              />
              {{ t('footer.trust.returns') }}
            </li>
          </ul>
        </div>

        <USeparator />

        <!-- Brand + newsletter + columns -->
        <div class="grid grid-cols-2 gap-8 pt-8 lg:grid-cols-12">
          <div class="col-span-2 flex flex-col gap-5 lg:col-span-4">
            <LayoutLogo />
            <p class="max-w-xs text-sm text-muted">
              {{ storeConfig?.brand_tagline?.trim() || t('footer.brand.tagline') }}
            </p>

            <!-- Newsletter -->
            <div class="flex flex-col gap-2">
              <h3 class="text-sm font-semibold">
                {{ t('footer.newsletter.heading') }}
              </h3>
              <p class="text-xs text-muted">
                {{ t('footer.newsletter.description') }}
              </p>
              <form
                class="mt-1 flex max-w-sm flex-col gap-2"
                novalidate
                @submit.prevent="onNewsletterSubmit"
              >
                <label
                  for="footer-newsletter-email"
                  class="sr-only"
                >
                  {{ t('footer.newsletter.emailLabel') }}
                </label>
                <div class="flex gap-2">
                  <UInput
                    id="footer-newsletter-email"
                    v-model="email"
                    name="email"
                    type="email"
                    :placeholder="t('footer.newsletter.emailPlaceholder')"
                    class="flex-1"
                    autocomplete="email"
                    :disabled="submitting"
                  />
                  <UButton
                    type="submit"
                    color="primary"
                    :loading="submitting"
                  >
                    {{ t('footer.newsletter.submit') }}
                  </UButton>
                </div>
                <UCheckbox
                  id="footer-newsletter-consent"
                  v-model="consent"
                  :label="t('footer.newsletter.consentLabel')"
                  :disabled="submitting"
                  size="sm"
                />
                <p
                  v-if="error"
                  class="text-xs text-error"
                  role="alert"
                >
                  {{ error }}
                </p>
              </form>
            </div>

            <!-- Socials (hidden when store-config has no URLs) -->
            <div
              v-if="socials.length"
              class="mt-2 flex flex-col gap-2"
            >
              <h3 class="text-sm font-semibold">
                {{ t('footer.social.heading') }}
              </h3>
              <div class="flex gap-1">
                <UButton
                  v-for="s in socials"
                  :key="s.name"
                  :icon="s.icon"
                  color="neutral"
                  variant="ghost"
                  :to="s.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="t(s.labelKey)"
                />
              </div>
            </div>
          </div>

          <!-- Link columns: accordions on mobile, static lists on desktop. -->
          <nav
            v-for="col in linkColumns"
            :key="col.key"
            :aria-label="t(col.headingKey)"
            class="col-span-1 lg:col-span-2"
          >
            <details
              class="group footer-accordion"
              :open="columnsOpen"
            >
              <summary
                class="flex cursor-pointer items-center justify-between text-sm font-semibold lg:pointer-events-none lg:cursor-default"
              >
                {{ t(col.headingKey) }}
                <UIcon
                  name="i-lucide-chevron-down"
                  class="transition-transform group-open:rotate-180 lg:hidden"
                  aria-hidden="true"
                />
              </summary>
              <ul class="mt-3 flex flex-col gap-2">
                <li
                  v-for="item in col.items"
                  :key="item.labelKey"
                >
                  <button
                    v-if="isAction(item)"
                    type="button"
                    class="text-left text-sm text-muted hover:text-primary"
                    @click="openSettings()"
                  >
                    {{ t(item.labelKey) }}
                  </button>
                  <ULink
                    v-else
                    :to="localePath(item.to)"
                    class="text-sm text-muted hover:text-primary"
                  >
                    {{ t(item.labelKey) }}
                  </ULink>
                </li>
                <!-- US-only "Do Not Sell or Share" (gated; hidden by default). -->
                <li v-if="col.key === 'legal' && isUsVisitor">
                  <ULink
                    :to="localePath('/privacy-policy')"
                    class="text-sm text-muted hover:text-primary"
                  >
                    {{ t('footer.columns.legal.doNotSell') }}
                  </ULink>
                </li>
              </ul>
            </details>
          </nav>
        </div>

        <!-- Company-identification block (NIP / REGON / KRS) -->
        <template v-if="hasCompanyBlock">
          <USeparator class="mt-8" />
          <address class="mt-6 flex flex-col gap-1 text-xs not-italic text-muted">
            <span class="font-semibold text-default">{{ company?.legal_name }}</span>
            <span v-if="company?.address_line">{{ company.address_line }}</span>
            <span v-if="company?.address_line2">{{ company.address_line2 }}</span>
            <span v-if="company?.postal_city || company?.country">
              {{ [company?.postal_city, company?.country].filter(Boolean).join(', ') }}
            </span>
            <span class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              <span v-if="company?.nip">{{ t('footer.company.nip') }}: {{ company.nip }}</span>
              <span v-if="company?.regon">{{ t('footer.company.regon') }}: {{ company.regon }}</span>
              <span v-if="company?.krs">{{ t('footer.company.krs') }}: {{ company.krs }}</span>
            </span>
            <span class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              <ULink
                v-if="company?.email"
                :to="`mailto:${company.email}`"
                class="hover:text-primary"
              >
                {{ company.email }}
              </ULink>
              <ULink
                v-if="company?.phone"
                :to="`tel:${company.phone.replace(/\s+/g, '')}`"
                class="hover:text-primary"
              >
                {{ company.phone }}
              </ULink>
            </span>
          </address>
        </template>
      </UContainer>

      <USeparator />
    </template>

    <!-- Baseline bar -->
    <template #left>
      <p class="text-sm text-muted">
        {{ t('footer.copyright', { year, name: storeConfig?.store_name?.trim() || t('footer.logo.name') }) }}
      </p>
    </template>

    <div class="flex flex-wrap items-center justify-center gap-2">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="px-2"
        :aria-label="t('header.toggleLang')"
        @click="toggleLocale"
      >
        {{ locale === 'pl' ? 'PL' : 'EN' }}
      </UButton>
      <LayoutCurrencySwitcher />
      <LayoutBackToTop />
    </div>

    <template #right>
      <p class="text-xs text-muted">
        {{ t('footer.madeIn') }}
      </p>
    </template>
  </UFooter>
</template>

<style scoped>
/* Mobile: native <details> accordion. Desktop: always expanded, summary inert
   (the chevron is hidden + pointer-events disabled via `lg:` utility classes). */
.footer-accordion > summary {
  list-style: none;
}
.footer-accordion > summary::-webkit-details-marker {
  display: none;
}
</style>
