<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { storeCreditKindKey } from '#shared/utils/giftCard'

/**
 * Customer store-credit page: per-currency balances + the unified ledger
 * (newest first) from `GET /api/v1/account/store-credit`. Store credit is
 * admin-/refund-granted (D1); this is a read-only view — the customer spends it
 * at checkout via the store-credit toggle. Empty-safe: with no accounts the
 * page shows a friendly empty state rather than an empty table.
 */

definePageMeta({ layout: 'account', middleware: 'user' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

const { data: summary, status } = useMyStoreCreditQuery()

const accounts = computed(() => summary.value?.accounts ?? [])
const entries = computed(() => summary.value?.entries ?? [])
const hasCredit = computed(() => accounts.value.length > 0 || entries.value.length > 0)
const isLoading = computed(() => status.value === 'pending')

function money(value: number, currency: string) {
  return formatMoney(value, currency as CurrencyCode, locale.value)
}

/** Signed display: `+X` for grants/refunds, `−X` for redemptions. */
function signedMoney(value: number, currency: string) {
  const formatted = money(Math.abs(value), currency)
  return value < 0 ? `−${formatted}` : `+${formatted}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(locale.value)
}

useHead({ title: () => t('account.storeCredit.title') })
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header>
        <h1 class="text-2xl font-bold">
          {{ t('account.storeCredit.title') }}
        </h1>
        <p class="text-sm text-muted">
          {{ t('account.storeCredit.subtitle') }}
        </p>
      </header>

      <ClientOnly>
        <div
          v-if="isLoading"
          class="py-12 text-center text-muted"
        >
          {{ t('actions.loading') }}
        </div>

        <div
          v-else-if="!hasCredit"
          class="rounded-lg border border-gray-200 py-12 text-center text-muted dark:border-gray-800"
          data-testid="store-credit-empty"
        >
          {{ t('account.storeCredit.empty') }}
        </div>

        <template v-else>
          <!-- Per-currency balances -->
          <section>
            <h2 class="mb-2 font-semibold">
              {{ t('account.storeCredit.balances') }}
            </h2>
            <ul
              class="grid gap-3 sm:grid-cols-2"
              data-testid="store-credit-balances"
            >
              <li
                v-for="account in accounts"
                :key="account.currency"
                class="flex items-baseline justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800"
              >
                <span class="text-sm text-muted">{{ account.currency }}</span>
                <span class="text-lg font-semibold">{{ money(account.balance, account.currency) }}</span>
              </li>
            </ul>
          </section>

          <!-- Ledger -->
          <section v-if="entries.length > 0">
            <h2 class="mb-2 font-semibold">
              {{ t('account.storeCredit.ledger.title') }}
            </h2>
            <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table class="w-full text-sm">
                <thead class="border-b border-gray-200 text-left text-muted dark:border-gray-800">
                  <tr>
                    <th class="p-3 font-medium">
                      {{ t('account.storeCredit.ledger.kind') }}
                    </th>
                    <th class="p-3 text-right font-medium">
                      {{ t('account.storeCredit.ledger.amount') }}
                    </th>
                    <th class="p-3 text-right font-medium">
                      {{ t('account.storeCredit.ledger.balanceAfter') }}
                    </th>
                    <th class="p-3 font-medium">
                      {{ t('account.storeCredit.ledger.order') }}
                    </th>
                    <th class="p-3 text-right font-medium">
                      {{ t('account.storeCredit.ledger.date') }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr
                    v-for="entry in entries"
                    :key="entry.id"
                    data-testid="store-credit-entry"
                  >
                    <td class="p-3">
                      {{ t(storeCreditKindKey(entry.kind)) }}
                    </td>
                    <td
                      :class="[
                        'p-3 text-right font-medium',
                        entry.amount < 0 ? 'text-muted' : 'text-primary',
                      ]"
                    >
                      {{ signedMoney(entry.amount, entry.currency) }}
                    </td>
                    <td class="p-3 text-right">
                      {{ money(entry.balance_after, entry.currency) }}
                    </td>
                    <td class="p-3">
                      <ULink
                        v-if="entry.order_id"
                        :to="localePath(`/account/orders/${entry.order_id}`)"
                        class="text-primary hover:underline"
                      >
                        #{{ entry.order_id }}
                      </ULink>
                      <span
                        v-else
                        class="text-muted"
                      >—</span>
                    </td>
                    <td class="p-3 text-right text-muted">
                      {{ formatDate(entry.created_at) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
