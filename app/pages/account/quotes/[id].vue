<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

definePageMeta({ layout: 'account', middleware: 'user' })

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const id = computed(() => {
  const n = Number(route.params.id)
  return Number.isInteger(n) && n > 0 ? n : undefined
})

const { data: quote, error } = useMyQuoteQuery(id)
const acceptMutation = useAcceptQuote()
const convertMutation = useConvertMyQuote()

const acceptOpen = ref(false)
const acceptError = ref<ProblemDetails | null>(null)
const convertOpen = ref(false)
const convertError = ref<ProblemDetails | null>(null)

// Only a `sent` quote can be accepted by the customer (the server enforces it
// too — 409 otherwise). The status helper is the single source of the literal.
const canAccept = computed(() => quote.value?.status === 'sent')
// An `accepted` quote not yet converted can be self-served into a pending order.
// The server re-checks (422 wrong state / lacks stock, 409 already converted).
const canConvert = computed(
  () => quote.value?.status === 'accepted' && !quote.value?.converted_order_id,
)

function money(value: number) {
  return quote.value ? formatMoney(value, quote.value.currency as CurrencyCode, locale.value) : ''
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(locale.value)
}

async function confirmAccept() {
  if (!id.value) return
  acceptError.value = null
  try {
    await acceptMutation.mutateAsync(id.value)
    acceptOpen.value = false
  }
  catch (err) {
    acceptError.value = parseProblem(err)
  }
}

async function confirmConvert() {
  if (!id.value) return
  convertError.value = null
  try {
    const order = await convertMutation.mutateAsync(id.value)
    convertOpen.value = false
    await navigateTo(localePath(`/account/orders/${order.id}`))
  }
  catch (err) {
    convertError.value = parseProblem(err)
  }
}

useHead({
  title: () => (quote.value
    ? t('account.quotes.detail.title', { id: quote.value.id })
    : t('account.quotes.title')),
})
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-3xl px-4 py-8">
      <NuxtLink
        :to="localePath('/account/quotes')"
        class="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-primary"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        {{ t('account.quotes.back') }}
      </NuxtLink>

      <ErrorAlert
        v-if="error"
        :problem="parseProblem(error)"
      />

      <div
        v-else-if="!quote"
        class="py-12 text-center text-muted"
      >
        {{ t('actions.loading') }}
      </div>

      <div
        v-else
        class="space-y-6"
      >
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold">
              {{ t('account.quotes.detail.title', { id: quote.id }) }}
            </h1>
            <p class="text-sm text-muted">
              {{
                t('account.quotes.detail.requestedOn', {
                  date: formatDate(quote.created_at),
                })
              }}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <AccountQuotesStatusBadge :status="quote.status" />
            <AccountQuotesDownloadButton
              :quote-id="quote.id"
              size="sm"
            />
            <UButton
              v-if="canAccept"
              color="primary"
              size="sm"
              icon="i-lucide-check"
              data-testid="accept-quote"
              @click="acceptOpen = true; acceptError = null"
            >
              {{ t('account.quotes.accept.button') }}
            </UButton>
            <UButton
              v-if="canConvert"
              color="primary"
              size="sm"
              icon="i-lucide-shopping-cart"
              data-testid="convert-quote"
              @click="convertOpen = true; convertError = null"
            >
              {{ t('account.quotes.convert.button') }}
            </UButton>
          </div>
        </header>

        <div
          v-if="quote.valid_until"
          class="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
        >
          <span class="text-muted">{{ t('account.quotes.fields.validUntil') }}:</span>
          {{ formatDate(quote.valid_until) }}
        </div>

        <section>
          <h2 class="mb-2 font-semibold">
            {{ t('account.quotes.detail.items') }}
          </h2>
          <ul
            :class="[
              'divide-y divide-gray-100 rounded-lg border border-gray-200',
              'dark:divide-gray-800 dark:border-gray-800',
            ]"
          >
            <li
              v-for="item in quote.items ?? []"
              :key="item.id"
              class="flex items-start justify-between gap-3 p-3 text-sm"
            >
              <div>
                <p class="font-medium">
                  {{ item.description }}
                </p>
                <p class="text-xs text-muted">
                  {{ item.quantity }} ×
                  {{ t('account.quotes.detail.each', { price: money(item.unit_price) }) }}
                </p>
              </div>
              <span class="font-medium">{{ money(item.line_total) }}</span>
            </li>
          </ul>
        </section>

        <div class="grid gap-6 sm:grid-cols-2">
          <section v-if="quote.notes">
            <h2 class="mb-2 font-semibold">
              {{ t('account.quotes.detail.notes') }}
            </h2>
            <p class="text-sm text-muted">
              {{ quote.notes }}
            </p>
          </section>

          <section
            class="h-fit rounded-lg border border-gray-200 p-4 sm:col-start-2 dark:border-gray-800"
          >
            <div class="flex justify-between py-1 text-sm">
              <span class="text-muted">{{ t('account.quotes.detail.subtotal') }}</span>
              <span>{{ money(quote.subtotal) }}</span>
            </div>
            <div
              :class="[
                'mt-1 flex justify-between border-t border-gray-100 pt-2',
                'font-medium dark:border-gray-800',
              ]"
            >
              <span>{{ t('account.quotes.detail.total') }}</span><span>{{ money(quote.total) }}</span>
            </div>
          </section>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="acceptOpen"
      :title="t('account.quotes.accept.title')"
      :description="t('account.quotes.accept.body')"
    >
      <template #body>
        <ErrorAlert
          v-if="acceptError"
          :problem="acceptError"
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            @click="() => { acceptOpen = false }"
          >
            {{ t('account.quotes.accept.dismiss') }}
          </UButton>
          <UButton
            color="primary"
            :loading="acceptMutation.isLoading.value"
            data-testid="accept-quote-confirm"
            @click="confirmAccept"
          >
            {{ t('account.quotes.accept.confirm') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="convertOpen"
      :title="t('account.quotes.convert.title')"
      :description="t('account.quotes.convert.body')"
    >
      <template #body>
        <ErrorAlert
          v-if="convertError"
          :problem="convertError"
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            @click="() => { convertOpen = false }"
          >
            {{ t('account.quotes.convert.dismiss') }}
          </UButton>
          <UButton
            color="primary"
            :loading="convertMutation.isLoading.value"
            data-testid="convert-quote-confirm"
            @click="confirmConvert"
          >
            {{ t('account.quotes.convert.confirm') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </NuxtLayout>
</template>
