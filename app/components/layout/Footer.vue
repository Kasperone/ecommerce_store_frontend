<script setup lang="ts">
import { z } from 'zod'

const { t } = useI18n()
const toast = useToast()

const email = ref('')
const error = ref<string | null>(null)
const year = new Date().getFullYear()

const newsletterSchema = z.object({
  email: z.string().email(),
})

async function onNewsletterSubmit() {
  const result = newsletterSchema.safeParse({ email: email.value })
  if (!result.success) {
    error.value = t('footer.brand.newsletter.invalidEmail')
    return
  }
  error.value = null
  toast.add({
    title: t('footer.brand.newsletter.success'),
    color: 'success',
  })
  email.value = ''
}

interface LinkItem {
  labelKey: string
  to: string
}

interface LinkColumn {
  headingKey: string
  ariaKey: string
  items: LinkItem[]
}

const linkColumns: LinkColumn[] = [
  {
    headingKey: 'footer.columns.shop.heading',
    ariaKey: 'footer.columns.shop.heading',
    items: [
      { labelKey: 'footer.columns.shop.newArrivals', to: '/' },
      { labelKey: 'footer.columns.shop.bestsellers', to: '/' },
      { labelKey: 'footer.columns.shop.deals', to: '/' },
    ],
  },
  {
    headingKey: 'footer.columns.help.heading',
    ariaKey: 'footer.columns.help.heading',
    items: [
      { labelKey: 'footer.columns.help.contact', to: '/contact' },
      { labelKey: 'footer.columns.help.shippingReturns', to: '/shipping-returns' },
      { labelKey: 'footer.columns.help.faq', to: '/contact' },
    ],
  },
  {
    headingKey: 'footer.columns.company.heading',
    ariaKey: 'footer.columns.company.heading',
    items: [
      { labelKey: 'footer.columns.company.about', to: '/about' },
      { labelKey: 'footer.columns.company.careers', to: '/about' },
      { labelKey: 'footer.columns.company.press', to: '/about' },
    ],
  },
  {
    headingKey: 'footer.columns.legal.heading',
    ariaKey: 'footer.columns.legal.heading',
    items: [
      { labelKey: 'footer.columns.legal.terms', to: '/terms-of-service' },
      { labelKey: 'footer.columns.legal.privacy', to: '/privacy-policy' },
      { labelKey: 'footer.columns.legal.cookies', to: '/privacy-policy' },
    ],
  },
  {
    headingKey: 'footer.columns.account.heading',
    ariaKey: 'footer.columns.account.heading',
    items: [
      { labelKey: 'footer.columns.account.signIn', to: '/login' },
      { labelKey: 'footer.columns.account.register', to: '/sign-up' },
      { labelKey: 'footer.columns.account.myAccount', to: '/account' },
    ],
  },
]

const socials = [
  { name: 'instagram', icon: 'i-simple-icons-instagram', labelKey: 'footer.social.instagram' },
  { name: 'facebook', icon: 'i-simple-icons-facebook', labelKey: 'footer.social.facebook' },
  { name: 'tiktok', icon: 'i-simple-icons-tiktok', labelKey: 'footer.social.tiktok' },
  { name: 'youtube', icon: 'i-simple-icons-youtube', labelKey: 'footer.social.youtube' },
]

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
      <UContainer class="py-12">
        <div class="grid grid-cols-2 lg:grid-cols-12 gap-8">
          <div class="col-span-2 lg:col-span-4 flex flex-col gap-5">
            <p class="text-lg font-semibold">LOGO</p>
            <p class="text-muted text-sm max-w-xs">
              {{ t('footer.brand.tagline') }}
            </p>

            <div class="flex flex-col gap-2">
              <h3 class="text-sm font-semibold">{{ t('footer.brand.newsletter.heading') }}</h3>
              <p class="text-muted text-xs">{{ t('footer.brand.newsletter.description') }}</p>
              <form
                class="flex flex-col gap-1.5 mt-1 max-w-sm"
                novalidate
                @submit.prevent="onNewsletterSubmit"
              >
                <label for="footer-newsletter-email" class="sr-only">
                  {{ t('footer.brand.newsletter.emailLabel') }}
                </label>
                <div class="flex gap-2">
                  <UInput
                    id="footer-newsletter-email"
                    v-model="email"
                    name="email"
                    type="email"
                    :placeholder="t('footer.brand.newsletter.emailPlaceholder')"
                    class="flex-1"
                    autocomplete="email"
                  />
                  <UButton type="submit" color="primary">
                    {{ t('footer.brand.newsletter.submit') }}
                  </UButton>
                </div>
                <p v-if="error" class="text-error text-xs" role="alert">{{ error }}</p>
              </form>
            </div>

            <div class="flex flex-col gap-2 mt-2">
              <h3 class="text-sm font-semibold">{{ t('footer.social.heading') }}</h3>
              <div class="flex gap-1">
                <UButton
                  v-for="s in socials"
                  :key="s.name"
                  :icon="s.icon"
                  color="neutral"
                  variant="ghost"
                  to="#"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="t(s.labelKey)"
                />
              </div>
            </div>
          </div>

          <nav
            v-for="col in linkColumns"
            :key="col.headingKey"
            :aria-label="t(col.ariaKey)"
            class="col-span-1 lg:col-span-2 flex flex-col gap-3"
          >
            <h3 class="text-sm font-semibold">{{ t(col.headingKey) }}</h3>
            <ul class="flex flex-col gap-2">
              <li v-for="item in col.items" :key="item.labelKey + item.to">
                <ULink :to="item.to" class="text-muted hover:text-primary text-sm">
                  {{ t(item.labelKey) }}
                </ULink>
              </li>
            </ul>
          </nav>
        </div>
      </UContainer>

      <USeparator />
    </template>

    <template #left>
      <p class="text-muted text-sm">{{ t('footer.copyright', { year }) }}</p>
    </template>

    <div
      :aria-label="t('footer.payment.heading')"
      class="flex flex-wrap items-center justify-center gap-2 text-muted"
    >
      <template v-for="p in paymentMethods" :key="p.name">
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
          class="text-xs font-bold tracking-tight px-1.5 py-0.5 border border-current rounded"
        >
          {{ p.text }}
        </span>
      </template>
    </div>

    <template #right>
      <p class="text-muted text-xs">{{ t('footer.madeIn') }}</p>
    </template>
  </UFooter>
</template>
