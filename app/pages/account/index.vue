<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { countryName } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'

/**
 * Account Overview — the real dashboard (account-panel redesign, Phase 3, §3.5).
 * Replaces the old three link-cards with a recent-orders snapshot, a default-
 * address card, a quick-actions grid, and (B2B only) a quotes summary.
 *
 * Every data section reuses the existing authed Pinia-Colada queries already
 * driving the orders / addresses / quotes pages — no new backend. Those queries
 * are client-gated (`enabled: () => import.meta.client`) and Colada isn't
 * SSR-serialized, so the data-driven sections render inside <ClientOnly> to keep
 * server + client first render in agreement (SSR-hydration rule #87).
 */

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t, locale } = useI18n()
const authStore = useAuthStore()
const localePath = useLocalePath()

useHead({
  title: () => t('account.nav.title'),
})

// Recent orders — first 3 of the same list the /account/orders page renders.
const { data: ordersData } = useOrdersQuery(computed(() => ({ page: 1, pageSize: 3 })))
const recentOrders = computed(() => ordersData.value?.items ?? [])

// Default address — prefer default-shipping, fall back to the first saved one.
const { data: addresses } = useAddressesQuery()
const defaultAddress = computed(() => {
  const list = addresses.value ?? []
  return list.find(a => a.is_default_shipping) ?? list[0] ?? null
})

// Account-completeness nudge (Phase 4, Baymard §1.1 "pre-populate stored data"):
// surface the still-blank essentials so the user can fill them before they hit
// a blank field at checkout. Dismissible for the session.
const nudgeDismissed = ref(false)
const completenessItems = computed(() => {
  const items: { key: string, to: string, icon: string }[] = []
  if (!authStore.user?.phone) {
    items.push({ key: 'phone', to: localePath('/account/profile'), icon: 'i-lucide-phone' })
  }
  if (!(addresses.value ?? []).some(a => a.is_default_shipping)) {
    items.push({ key: 'address', to: localePath('/account/addresses'), icon: 'i-lucide-map-pin' })
  }
  return items
})
const showNudge = computed(() => !nudgeDismissed.value && completenessItems.value.length > 0)

// B2B quotes summary — gated behind company membership.
const { isB2B } = useCompanyContext()
const { data: quotes } = useMyQuotesQuery()
const openQuotes = computed(() =>
  (quotes.value ?? []).filter(q => ['requested', 'sent', 'accepted'].includes(q.status)),
)
const awaitingQuotes = computed(() =>
  (quotes.value ?? []).filter(q => q.status === 'sent'),
)

const welcomeName = computed(() =>
  authStore.user?.first_name || authStore.user?.email || '',
)

function placedOn(iso: string) {
  return new Date(iso).toLocaleDateString(locale.value)
}

function countryLabel(code: string) {
  return countryName(code, locale.value as SupportedLocale)
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-overview space-y-8">
      <header>
        <h1 class="text-2xl font-bold">
          {{ t('account.overview.welcome', { name: welcomeName }) }} 👋
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('account.signedInAs') }}
          <span class="font-medium">{{ authStore.user?.email }}</span>
        </p>
      </header>

      <!-- Account-completeness nudge — only shows while something's missing. -->
      <ClientOnly>
        <UAlert
          v-if="showNudge"
          color="primary"
          variant="soft"
          icon="i-lucide-sparkles"
          :title="t('account.overview.completeness.title')"
          :close="{ 'aria-label': t('actions.dismiss') }"
          data-testid="completeness-nudge"
          @update:open="(open: boolean) => { if (!open) nudgeDismissed = true }"
        >
          <template #description>
            <p class="mb-2">
              {{ t('account.overview.completeness.subtitle') }}
            </p>
            <ul class="flex flex-col gap-1">
              <li
                v-for="item in completenessItems"
                :key="item.key"
              >
                <NuxtLink
                  :to="item.to"
                  class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <UIcon
                    :name="item.icon"
                    class="size-4 shrink-0"
                  />
                  {{ t(`account.overview.completeness.${item.key}`) }}
                </NuxtLink>
              </li>
            </ul>
          </template>
        </UAlert>
      </ClientOnly>

      <ClientOnly>
        <div class="grid gap-6 md:grid-cols-3">
          <!-- Recent orders -->
          <UCard class="md:col-span-2">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-semibold">
                  {{ t('account.overview.recentOrders') }}
                </h2>
                <NuxtLink
                  :to="localePath('/account/orders')"
                  class="text-sm text-primary hover:underline"
                >
                  {{ t('account.overview.viewAllOrders') }} →
                </NuxtLink>
              </div>
            </template>

            <p
              v-if="recentOrders.length === 0"
              class="py-6 text-center text-sm text-muted"
            >
              {{ t('account.overview.noOrders') }}
            </p>

            <ul
              v-else
              class="divide-y divide-gray-100 dark:divide-gray-800"
            >
              <li
                v-for="order in recentOrders"
                :key="order.id"
              >
                <NuxtLink
                  :to="localePath(`/account/orders/${order.id}`)"
                  class="flex flex-wrap items-center justify-between gap-3 py-3 hover:opacity-80"
                >
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <span class="font-mono text-sm font-medium">{{ order.order_number }}</span>
                    <span class="text-xs text-muted">{{ placedOn(order.created_at) }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <OrdersStatusBadge :status="order.status" />
                    <span class="text-sm font-medium">
                      {{ formatMoney(order.total, order.currency as CurrencyCode, locale) }}
                    </span>
                    <UIcon
                      name="i-lucide-chevron-right"
                      class="size-4 text-muted"
                    />
                  </div>
                </NuxtLink>
              </li>
            </ul>
          </UCard>

          <!-- Default address -->
          <UCard>
            <template #header>
              <h2 class="font-semibold">
                {{ t('account.overview.defaultAddress') }}
              </h2>
            </template>

            <template v-if="defaultAddress">
              <address class="text-sm not-italic text-gray-600 dark:text-gray-400">
                <span class="block font-medium text-gray-900 dark:text-gray-100">
                  {{ defaultAddress.recipient_name }}
                </span>
                <span class="block">{{ defaultAddress.street }}</span>
                <span class="block">
                  {{ defaultAddress.postal_code }} {{ defaultAddress.city }}
                </span>
                <span class="block">{{ countryLabel(defaultAddress.country) }}</span>
              </address>
              <UButton
                :to="localePath('/account/addresses')"
                color="neutral"
                variant="soft"
                size="sm"
                class="mt-4"
              >
                {{ t('account.overview.manageAddresses') }}
              </UButton>
            </template>

            <template v-else>
              <p class="text-sm text-muted">
                {{ t('account.overview.noDefaultAddress') }}
              </p>
              <UButton
                :to="localePath('/account/addresses')"
                color="primary"
                variant="soft"
                size="sm"
                icon="i-lucide-plus"
                class="mt-4"
              >
                {{ t('account.overview.addAddress') }}
              </UButton>
            </template>
          </UCard>
        </div>

        <template #fallback>
          <div class="py-12 text-center text-muted">
            {{ t('actions.loading') }}
          </div>
        </template>
      </ClientOnly>

      <!-- Quick actions -->
      <section>
        <h2 class="mb-3 font-semibold">
          {{ t('account.overview.quickActions') }}
        </h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UButton
            :to="localePath('/account/orders')"
            color="neutral"
            variant="outline"
            icon="i-lucide-package-search"
            block
          >
            {{ t('account.overview.actions.trackOrder') }}
          </UButton>
          <UButton
            :to="localePath('/account/orders')"
            color="neutral"
            variant="outline"
            icon="i-lucide-repeat"
            block
          >
            {{ t('account.overview.actions.buyAgain') }}
          </UButton>
          <UButton
            :to="localePath('/account/addresses')"
            color="neutral"
            variant="outline"
            icon="i-lucide-map-pin"
            block
          >
            {{ t('account.overview.actions.addresses') }}
          </UButton>
          <UButton
            :to="localePath('/account/preferences')"
            color="neutral"
            variant="outline"
            icon="i-lucide-settings-2"
            block
          >
            {{ t('account.overview.actions.preferences') }}
          </UButton>
        </div>
      </section>

      <!-- B2B quotes summary -->
      <ClientOnly>
        <NuxtLink
          v-if="isB2B"
          :to="localePath('/account/quotes')"
          class="block"
          data-testid="quotes-summary-card"
        >
          <UCard class="transition hover:ring-2 hover:ring-primary">
            <div class="flex items-center gap-4">
              <UIcon
                name="i-lucide-file-text"
                class="size-8 shrink-0 text-primary"
              />
              <div class="min-w-0">
                <h2 class="font-semibold">
                  {{ t('account.overview.quotes.heading') }}
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  <template v-if="openQuotes.length > 0">
                    {{ t('account.overview.quotes.open', { count: openQuotes.length }, openQuotes.length) }}
                    <template v-if="awaitingQuotes.length > 0">
                      · {{ t('account.overview.quotes.awaiting', { count: awaitingQuotes.length }, awaitingQuotes.length) }}
                    </template>
                  </template>
                  <template v-else>
                    {{ t('account.overview.quotes.none') }}
                  </template>
                </p>
              </div>
              <UIcon
                name="i-lucide-chevron-right"
                class="ml-auto size-5 shrink-0 text-muted"
              />
            </div>
          </UCard>
        </NuxtLink>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
