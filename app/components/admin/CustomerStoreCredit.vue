<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'
import { adjustErrorKey } from '#shared/utils/giftCard'
import { formatMoney, type CurrencyCode } from '#shared/utils/money'
import type { StoreCreditAdjustRequest } from '~/composables/queries/useStoreCreditQueries'

/**
 * Per-customer store credit panel (admin customer detail): per-currency
 * balances, the signed adjust form, and the unified ledger (newest first).
 * Mirrors the <AdminCustomerNotes> card pattern; a below-zero adjust 400s
 * with the machine code `store_credit_balance_negative`, mapped to copy via
 * `adjustErrorKey`.
 */

const props = defineProps<{ customerId: number }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

const { data: summary, isLoading, error: loadError } = useCustomerStoreCreditQuery(
  () => props.customerId,
)
const adjustMutation = useAdjustCustomerStoreCredit()

const CREDIT_CURRENCIES: StoreCreditAdjustRequest['currency'][] = ['USD', 'PLN', 'EUR']

const amount = ref<number | null>(null)
const currency = ref<StoreCreditAdjustRequest['currency']>('USD')
const note = ref('')
const formError = ref<ProblemDetails | null>(null)

const currencyOptions = computed(() => CREDIT_CURRENCIES.map(c => ({ label: c, value: c })))

const accounts = computed(() => summary.value?.accounts ?? [])
const entries = computed(() => summary.value?.entries ?? [])

function money(value: number, code: string) {
  return formatMoney(value, code as CurrencyCode, locale.value)
}
function signedAmount(value: number, code: string) {
  return `${value > 0 ? '+' : ''}${money(value, code)}`
}
const dateFmt = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }),
)
function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.value.format(d)
}

async function onAdjust() {
  formError.value = null
  if (!amount.value) {
    formError.value = { title: t('admin.customers.storeCredit.errors.amountNonZero') }
    return
  }
  try {
    await adjustMutation.mutateAsync({
      customerId: props.customerId,
      body: {
        amount: amount.value,
        currency: currency.value,
        note: note.value.trim() || null,
      },
    })
    amount.value = null
    note.value = ''
    toast.add({
      title: t('admin.customers.storeCredit.flashes.adjusted'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    const problem = parseProblem(err)
    const key = adjustErrorKey(problem?.detail)
    // Known machine code → readable copy only (never surface the raw code).
    formError.value = key ? { title: t(key), status: problem?.status } : problem
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        {{ $t('admin.customers.storeCredit.title') }}
      </h2>
    </template>

    <ErrorAlert
      v-if="formError"
      :problem="formError"
      class="mb-4"
    />

    <ErrorAlert
      v-if="loadError"
      :problem="parseProblem(loadError)"
      class="mb-4"
    />

    <template v-else>
      <!-- Per-currency balances -->
      <div class="mb-4">
        <h3 class="text-muted text-xs uppercase tracking-wide mb-1">
          {{ $t('admin.customers.storeCredit.balances') }}
        </h3>
        <div
          v-if="isLoading"
          class="text-muted text-sm"
        >
          …
        </div>
        <p
          v-else-if="accounts.length === 0"
          class="text-muted text-sm"
          data-testid="store-credit-no-balances"
        >
          {{ $t('admin.customers.storeCredit.noBalances') }}
        </p>
        <div
          v-else
          class="flex flex-wrap gap-4"
        >
          <div
            v-for="account in accounts"
            :key="account.currency"
            class="rounded-md border border-default px-3 py-2"
            :data-testid="`store-credit-balance-${account.currency}`"
          >
            <div class="text-muted text-xs">
              {{ account.currency }}
            </div>
            <div class="font-semibold">
              {{ money(account.balance, account.currency) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Signed adjust -->
      <div class="space-y-2 mb-4">
        <p class="text-xs text-muted">
          {{ $t('admin.customers.storeCredit.adjust.hint') }}
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <UFormField :label="$t('admin.customers.storeCredit.adjust.amount')">
            <UInputNumber
              v-model="amount"
              :step="0.01"
              class="w-36"
              :disabled="adjustMutation.isLoading.value"
              data-testid="store-credit-adjust-amount"
            />
          </UFormField>
          <UFormField :label="$t('admin.customers.storeCredit.adjust.currency')">
            <USelect
              v-model="currency"
              :items="currencyOptions"
              value-key="value"
              class="w-28"
              :disabled="adjustMutation.isLoading.value"
              data-testid="store-credit-adjust-currency"
            />
          </UFormField>
          <UFormField
            :label="$t('admin.customers.storeCredit.adjust.note')"
            class="grow"
          >
            <UInput
              v-model="note"
              class="w-full"
              :disabled="adjustMutation.isLoading.value"
              data-testid="store-credit-adjust-note"
            />
          </UFormField>
          <UButton
            icon="i-lucide-scale"
            :label="$t('admin.customers.storeCredit.adjust.submit')"
            :loading="adjustMutation.isLoading.value"
            :disabled="!amount"
            data-testid="store-credit-adjust-submit"
            @click="onAdjust"
          />
        </div>
      </div>

      <!-- Ledger (newest first, straight from the API) -->
      <div>
        <h3 class="text-muted text-xs uppercase tracking-wide mb-1">
          {{ $t('admin.customers.storeCredit.ledger.title') }}
        </h3>
        <p
          v-if="entries.length === 0"
          class="text-muted text-sm"
        >
          {{ $t('admin.customers.storeCredit.ledger.empty') }}
        </p>
        <div
          v-else
          class="divide-y divide-default"
        >
          <div
            v-for="entry in entries"
            :key="entry.id"
            class="flex items-center justify-between gap-4 py-2 text-sm"
            :data-testid="`store-credit-entry-${entry.id}`"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  {{ $t(`admin.customers.storeCredit.ledger.kinds.${entry.kind}`) }}
                </UBadge>
                <span class="text-xs text-muted">{{ entry.currency }}</span>
                <ULink
                  v-if="entry.order_id"
                  :to="localePath(`/admin/orders/${entry.order_id}`)"
                  class="font-mono text-primary text-xs"
                >
                  {{ $t('admin.customers.storeCredit.ledger.order') }} #{{ entry.order_id }}
                </ULink>
              </div>
              <div
                v-if="entry.note"
                class="text-xs text-muted mt-0.5 truncate"
              >
                {{ entry.note }}
              </div>
            </div>
            <div class="text-right whitespace-nowrap">
              <div
                class="font-medium"
                :class="entry.amount > 0 ? 'text-success' : 'text-error'"
              >
                {{ signedAmount(entry.amount, entry.currency) }}
              </div>
              <div class="text-xs text-muted">
                {{ $t('admin.customers.storeCredit.ledger.balanceAfter') }}:
                {{ money(entry.balance_after, entry.currency) }}
                · {{ formatDate(entry.created_at) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UCard>
</template>
