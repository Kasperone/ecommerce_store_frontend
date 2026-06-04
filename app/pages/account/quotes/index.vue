<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({ layout: 'account', middleware: 'user' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

const { isB2B, isResolving } = useCompanyContext()
const { data: quotes, error } = useMyQuotesQuery()

useHead({ title: () => t('account.quotes.title') })

const rows = computed(() => quotes.value ?? [])

function requestedOn(iso: string) {
  return new Date(iso).toLocaleDateString(locale.value)
}

function money(value: number, currency: string) {
  return formatMoney(value, currency as CurrencyCode, locale.value)
}
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-4xl px-4 py-8">
      <header class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ t('account.quotes.title') }}
        </h1>
        <p class="text-muted text-sm">
          {{ t('account.quotes.subtitle') }}
        </p>
      </header>

      <ErrorAlert
        v-if="error"
        :problem="parseProblem(error)"
      />

      <ClientOnly>
        <!-- Not a B2B account: the customer reached the page directly. -->
        <div
          v-if="!isResolving && !isB2B"
          class="flex flex-col items-center gap-4 py-16 text-center"
          data-testid="not-b2b"
        >
          <UIcon
            name="i-lucide-building-2"
            class="size-12 text-muted"
          />
          <p class="text-muted">
            {{ t('account.quotes.notB2B') }}
          </p>
          <UButton
            color="primary"
            :to="localePath('/account')"
          >
            {{ t('account.quotes.backToAccount') }}
          </UButton>
        </div>

        <div
          v-else-if="!quotes"
          class="py-12 text-center text-muted"
        >
          {{ t('actions.loading') }}
        </div>

        <div
          v-else-if="rows.length === 0"
          class="flex flex-col items-center gap-4 py-16 text-center"
          data-testid="quotes-empty"
        >
          <UIcon
            name="i-lucide-file-text"
            class="size-12 text-muted"
          />
          <p class="text-muted">
            {{ t('account.quotes.empty') }}
          </p>
          <UButton
            color="primary"
            :to="localePath('/products')"
          >
            {{ t('account.quotes.emptyCta') }}
          </UButton>
        </div>

        <ul
          v-else
          :class="[
            'divide-y divide-gray-100 rounded-lg border border-gray-200',
            'dark:divide-gray-800 dark:border-gray-800',
          ]"
        >
          <li
            v-for="quote in rows"
            :key="quote.id"
            :class="[
              'flex flex-wrap items-center justify-between gap-3 p-4',
              'hover:bg-gray-50 dark:hover:bg-gray-900',
            ]"
          >
            <NuxtLink
              :to="localePath(`/account/quotes/${quote.id}`)"
              class="flex min-w-0 flex-1 flex-col gap-1"
            >
              <span class="font-mono font-medium">{{ t('account.quotes.numberPrefix') }}{{ quote.id }}</span>
              <span class="text-xs text-muted">
                {{ t('account.quotes.fields.requested') }}: {{ requestedOn(quote.created_at) }}
              </span>
            </NuxtLink>
            <div class="flex items-center gap-4">
              <AccountQuotesStatusBadge :status="quote.status" />
              <span class="font-medium">
                {{ money(quote.total, quote.currency) }}
              </span>
              <NuxtLink
                :to="localePath(`/account/quotes/${quote.id}`)"
                :aria-label="t('account.quotes.view')"
              >
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 text-muted"
                />
              </NuxtLink>
            </div>
          </li>
        </ul>

        <template #fallback>
          <div class="py-12 text-center text-muted">
            {{ t('actions.loading') }}
          </div>
        </template>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
