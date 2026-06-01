<script setup lang="ts">
import type { QuoteResponse, QuoteStatus, QuoteUpdate } from '~/composables/queries/useQuoteQueries'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'
import { QUOTE_STATUSES, quoteStatusColor } from '#shared/utils/quoteStatus'
import { formatMoney } from '#shared/utils/money'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
const toast = useToast()
const route = useRoute()
const quoteId = computed(() => {
  const raw = Number(route.params.id)
  return Number.isInteger(raw) && raw > 0 ? raw : undefined
})

const { data: quote, error: loadError, isLoading } = useQuoteQuery(quoteId)

const updateMutation = useUpdateQuote()
const deleteMutation = useDeleteQuote()
const convertMutation = useConvertQuote()

// Edit fields, seeded from the loaded quote.
const statusModel = ref<QuoteStatus | undefined>()
const notesModel = ref('')
const validUntilModel = ref('')
const formError = ref<ProblemDetails | null>(null)
const deleteOpen = ref(false)
const deleteError = ref<ProblemDetails | null>(null)
const convertOpen = ref(false)
const convertError = ref<ProblemDetails | null>(null)

// The conversion marker: once a quote is converted the backend sets
// `converted_order_id` on it. NB the field may be absent from the response schema
// (escalation E-QC-1) — read it behind an `in`-guard so this stays inert (always
// null) until the backend exposes it, at which point the converted-state UI lights
// up with no further change. The BE 409 still backstops a double-convert meanwhile.
const convertedOrderId = computed<number | null>(() => {
  const q = quote.value as (QuoteResponse & { converted_order_id?: number | null }) | undefined
  if (!q || !('converted_order_id' in q)) return null
  return q.converted_order_id ?? null
})

// Convert is offered only for an accepted, not-yet-converted quote.
const canConvert = computed(() =>
  quote.value?.status === 'accepted' && convertedOrderId.value === null,
)

async function onConvertConfirm() {
  if (!quote.value) return
  convertError.value = null
  try {
    const order = await convertMutation.mutateAsync(quote.value.id)
    convertOpen.value = false
    toast.add({
      title: t('admin.quotes.convert.flash', { number: order.order_number }),
      color: 'success',
      icon: 'i-lucide-check',
    })
    await navigateTo(`/admin/orders/${order.id}`)
  }
  catch (err) {
    convertError.value = parseProblem(err)
  }
}

watch(quote, (q) => {
  if (!q) return
  statusModel.value = q.status
  notesModel.value = q.notes ?? ''
  validUntilModel.value = toDateInput(q.valid_until)
}, { immediate: true })

// Any → any transition is allowed in the MVP (the backend doesn't constrain
// quote status transitions), so the dropdown offers the full set.
const statusOptions = computed(() =>
  QUOTE_STATUSES.map(s => ({ label: t(`admin.quotes.status.${s}`), value: s })),
)

function money(amount: number, currency: string) {
  return formatMoney(amount, currency as 'USD' | 'PLN' | 'EUR', locale.value)
}

// `<input type="date">` wants `YYYY-MM-DD`; slice an ISO datetime down to it.
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

async function onSave() {
  if (!quote.value) return
  formError.value = null
  // Note: omit `items` so the existing line set is left untouched (the backend
  // only replaces lines when a non-empty `items` is sent).
  const patch: QuoteUpdate = {
    status: statusModel.value,
    notes: notesModel.value.trim() || null,
    valid_until: validUntilModel.value || null,
  }
  try {
    await updateMutation.mutateAsync({ id: quote.value.id, patch })
    toast.add({
      title: t('admin.quotes.flashes.updated'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}

async function onDeleteConfirm() {
  if (!quote.value) return
  deleteError.value = null
  try {
    await deleteMutation.mutateAsync(quote.value.id)
    deleteOpen.value = false
    toast.add({
      title: t('admin.quotes.flashes.deleted'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    await navigateTo('/admin/quotes')
  }
  catch (err) {
    deleteError.value = parseProblem(err)
  }
}

useHead({ title: () => t('admin.quotes.detail.title', { id: quote.value?.id ?? '' }) })
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-4xl">
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        :padded="false"
        @click="navigateTo('/admin/quotes')"
      >
        {{ $t('admin.quotes.actions.back') }}
      </UButton>

      <div
        v-if="isLoading"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.quotes.detail.loading') }}
      </div>

      <ErrorAlert
        v-else-if="loadError"
        :problem="parseProblem(loadError)"
      />

      <template v-else-if="quote">
        <header class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-2xl font-bold font-mono">
              {{ $t('admin.quotes.detail.heading', { id: quote.id }) }}
            </h1>
            <p class="text-muted text-sm mt-1">
              {{ quote.company_name ?? '—' }}
            </p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <UBadge
              :color="quoteStatusColor(quote.status)"
              variant="subtle"
              size="lg"
            >
              {{ $t(`admin.quotes.status.${quote.status}`) }}
            </UBadge>
            <UButton
              v-if="canConvert"
              color="primary"
              icon="i-lucide-file-output"
              data-testid="quote-convert"
              @click="convertError = null; convertOpen = true"
            >
              {{ $t('admin.quotes.convert.action') }}
            </UButton>
            <UButton
              v-else-if="convertedOrderId !== null"
              color="success"
              variant="soft"
              icon="i-lucide-package-check"
              data-testid="quote-converted-link"
              @click="navigateTo(`/admin/orders/${convertedOrderId}`)"
            >
              {{ $t('admin.quotes.convert.converted') }}
            </UButton>
          </div>
        </header>

        <!-- Items -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.quotes.detail.items') }}
            </h2>
          </template>
          <p
            v-if="!quote.items || quote.items.length === 0"
            class="text-sm text-muted"
          >
            {{ $t('admin.quotes.detail.noItems') }}
          </p>
          <div
            v-else
            class="divide-y divide-default"
          >
            <div
              v-for="item in quote.items"
              :key="item.id"
              class="flex items-center justify-between gap-4 py-2 text-sm"
              :data-testid="`quote-item-${item.id}`"
            >
              <div class="font-medium">
                {{ item.description }}
              </div>
              <div class="text-right whitespace-nowrap">
                <div>
                  {{ item.quantity }} &times; {{ money(item.unit_price, quote.currency) }}
                </div>
                <div class="text-muted">
                  {{ money(item.line_total, quote.currency) }}
                </div>
              </div>
            </div>
          </div>
          <template #footer>
            <dl class="space-y-1 text-sm ml-auto w-full max-w-xs">
              <div class="flex justify-between">
                <dt class="text-muted">
                  {{ $t('admin.quotes.detail.subtotal') }}
                </dt>
                <dd data-testid="quote-subtotal">
                  {{ money(quote.subtotal, quote.currency) }}
                </dd>
              </div>
              <div class="flex justify-between font-semibold border-t border-default pt-1">
                <dt>{{ $t('admin.quotes.detail.total') }}</dt>
                <dd data-testid="quote-total">
                  {{ money(quote.total, quote.currency) }}
                </dd>
              </div>
            </dl>
          </template>
        </UCard>

        <!-- Manage -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.quotes.detail.manage') }}
            </h2>
          </template>

          <ErrorAlert
            v-if="formError"
            :problem="formError"
            class="mb-4"
          />

          <div class="space-y-4">
            <UFormField :label="$t('admin.quotes.detail.changeStatus')">
              <USelect
                v-model="statusModel"
                :items="statusOptions"
                value-key="value"
                class="w-60"
                data-testid="quote-status-select"
              />
            </UFormField>

            <UFormField :label="$t('admin.quotes.detail.validUntil')">
              <UInput
                v-model="validUntilModel"
                type="date"
                class="w-60"
                data-testid="quote-valid-until"
              />
            </UFormField>

            <UFormField :label="$t('admin.quotes.detail.notes')">
              <UTextarea
                v-model="notesModel"
                :rows="3"
                class="w-full"
                data-testid="quote-notes"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <UButton
                color="error"
                variant="soft"
                icon="i-lucide-trash-2"
                @click="deleteError = null; deleteOpen = true"
              >
                {{ $t('admin.quotes.actions.delete') }}
              </UButton>
              <UButton
                color="primary"
                icon="i-lucide-save"
                :loading="updateMutation.isLoading.value"
                data-testid="quote-save"
                @click="onSave"
              >
                {{ $t('admin.quotes.actions.save') }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>

      <UModal
        :open="deleteOpen"
        :title="$t('admin.quotes.delete.title')"
        :description="$t('admin.quotes.delete.body')"
        :dismissible="!deleteMutation.isLoading.value"
        @update:open="(v) => { deleteOpen = v; if (!v) deleteError = null }"
      >
        <template #body>
          <ErrorAlert
            v-if="deleteError"
            :problem="deleteError"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="deleteMutation.isLoading.value"
              @click="deleteOpen = false"
            >
              {{ $t('admin.quotes.delete.dismiss') }}
            </UButton>
            <UButton
              color="error"
              :loading="deleteMutation.isLoading.value"
              @click="onDeleteConfirm"
            >
              {{ $t('admin.quotes.delete.confirm') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal
        :open="convertOpen"
        :title="$t('admin.quotes.convert.confirmTitle')"
        :description="$t('admin.quotes.convert.confirmBody')"
        :dismissible="!convertMutation.isLoading.value"
        @update:open="(v) => { convertOpen = v; if (!v) convertError = null }"
      >
        <template #body>
          <ErrorAlert
            v-if="convertError"
            :problem="convertError"
            data-testid="quote-convert-error"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="convertMutation.isLoading.value"
              @click="convertOpen = false"
            >
              {{ $t('admin.quotes.convert.dismiss') }}
            </UButton>
            <UButton
              color="primary"
              :loading="convertMutation.isLoading.value"
              data-testid="quote-convert-confirm"
              @click="onConvertConfirm"
            >
              {{ $t('admin.quotes.convert.confirm') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>
