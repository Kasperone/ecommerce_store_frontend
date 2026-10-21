<script setup lang="ts">
import type { RefundReason, ReturnRefundRequest } from '#shared/types/api'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import { returnNextActions, returnStatusColor } from '#shared/utils/returnStatus'
import type { ReturnTransitionAction } from '~/composables/queries/useReturnQueries'
import { formatMoney } from '#shared/utils/money'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const route = useRoute()
// Refunds are financial (orders:refund) — distinct from the orders:write that
// grants access to the returns section. Hide the Refund action accordingly.
const auth = useAuthStore()
const returnId = computed(() => {
  const raw = Number(route.params.id)
  return Number.isInteger(raw) && raw > 0 ? raw : undefined
})

const { data: ret, error: loadError, isLoading } = useAdminReturnQuery(returnId)

const transitionMutation = useReturnTransition()
const refundMutation = useReturnRefund()

// ---------------------------------------------------------------------------
// Transition modal (approve / reject / receive) — one modal, mode-switched,
// with the optional internal admin note. Mirrors the quotes-detail modals.
// ---------------------------------------------------------------------------

const actionOpen = ref(false)
const actionMode = ref<ReturnTransitionAction>('approve')
const adminNoteModel = ref('')

// Modals have no client-validatable fields, so they converge only the error
// message + toast: a null form ref makes applyApiError skip field-mapping.
const noForm = ref<ValidatedFormInstance | null>(null)
const { errorMessage: actionError, applyApiError: applyActionError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})
const { errorMessage: refundError, applyApiError: applyRefundError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

const availableActions = computed(() =>
  ret.value ? returnNextActions(ret.value.status) : [],
)

function openAction(mode: ReturnTransitionAction) {
  actionMode.value = mode
  adminNoteModel.value = ret.value?.admin_note ?? ''
  actionError.value = ''
  actionOpen.value = true
}

async function onActionConfirm() {
  if (!ret.value) return
  actionError.value = ''
  try {
    await transitionMutation.mutateAsync({
      id: ret.value.id,
      action: actionMode.value,
      adminNote: adminNoteModel.value.trim() || null,
    })
    actionOpen.value = false
    toast.add({
      title: t(`admin.returns.flashes.${actionMode.value}`),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    applyActionError(err, t('messages.saveError'))
  }
}

// ---------------------------------------------------------------------------
// Refund dialog — amount defaults to the returned-line total (editable),
// restock toggle (default off; restock happens NOW, not at receive), refund
// reason + optional internal note. Mirrors <AdminOrderRefundDialog> patterns.
// ---------------------------------------------------------------------------

const refundOpen = ref(false)
const refundAmount = ref<number>(0)
const refundRestock = ref(false)
const refundReason = ref<RefundReason>('customer_request')
const refundNote = ref('')

const REFUND_REASONS: RefundReason[] = [
  'defective',
  'wrong_item',
  'customer_request',
  'lost_in_transit',
  'damaged_in_transit',
  'other',
]

const refundReasonOptions = computed(() =>
  REFUND_REASONS.map(value => ({
    value,
    label: t(`admin.orders.refund.reasonOptions.${value}`),
  })),
)

/** Σ unit_price × returned qty — the backend's default when amount is omitted. */
const lineTotal = computed(() =>
  (ret.value?.items ?? []).reduce(
    (acc, item) => acc + (item.line_subtotal ?? (item.unit_price ?? 0) * item.quantity),
    0,
  ),
)

function openRefund() {
  refundAmount.value = Math.round(lineTotal.value * 100) / 100
  refundRestock.value = false
  refundReason.value = 'customer_request'
  refundNote.value = ''
  refundError.value = ''
  refundOpen.value = true
}

async function onRefundConfirm() {
  if (!ret.value) return
  refundError.value = ''
  const payload: ReturnRefundRequest = {
    amount: refundAmount.value,
    restock: refundRestock.value,
    reason: refundReason.value,
    note: refundNote.value.trim() || null,
  }
  try {
    await refundMutation.mutateAsync({ id: ret.value.id, refund: payload })
    refundOpen.value = false
    toast.add({
      title: t('admin.returns.flashes.refunded'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    applyRefundError(err, t('messages.saveError'))
  }
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const currency = computed(() => ret.value?.currency ?? 'USD')

function money(amount: number) {
  return formatMoney(amount, currency.value as 'USD' | 'PLN' | 'EUR', locale.value)
}

const dateFmt = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }),
)
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.value.format(d)
}

/** Simple status timeline: requested → (resolution) — driven by the row's stamps. */
const timeline = computed(() => {
  if (!ret.value) return []
  const events: Array<{ key: string, date: string | null }> = [
    { key: 'requested', date: ret.value.created_at },
  ]
  if (ret.value.status !== 'requested') {
    events.push({ key: ret.value.status, date: ret.value.resolved_at ?? ret.value.updated_at })
  }
  return events
})

useHead({ title: () => t('admin.returns.detail.title', { id: ret.value?.id ?? '' }) })
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-4xl">
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        :padded="false"
        :to="localePath('/admin/returns')"
      >
        {{ $t('admin.returns.actions.back') }}
      </UButton>

      <div
        v-if="isLoading"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.returns.detail.loading') }}
      </div>

      <ErrorAlert
        v-else-if="loadError"
        :problem="parseProblem(loadError)"
      />

      <template v-else-if="ret">
        <header class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-2xl font-bold font-mono">
              {{ $t('admin.returns.detail.heading', { id: ret.id }) }}
            </h1>
            <p class="text-muted text-sm mt-1">
              {{ ret.customer_email ?? '—' }}
            </p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <UBadge
              :color="returnStatusColor(ret.status)"
              variant="subtle"
              size="lg"
              data-testid="return-status-badge"
            >
              {{ $t(`admin.returns.status.${ret.status}`) }}
            </UBadge>
            <UButton
              v-if="availableActions.includes('approve')"
              color="success"
              icon="i-lucide-check"
              data-testid="return-approve"
              @click="openAction('approve')"
            >
              {{ $t('admin.returns.actions.approve') }}
            </UButton>
            <UButton
              v-if="availableActions.includes('reject')"
              color="error"
              variant="soft"
              icon="i-lucide-x"
              data-testid="return-reject"
              @click="openAction('reject')"
            >
              {{ $t('admin.returns.actions.reject') }}
            </UButton>
            <UButton
              v-if="availableActions.includes('receive')"
              color="info"
              icon="i-lucide-package-check"
              data-testid="return-receive"
              @click="openAction('receive')"
            >
              {{ $t('admin.returns.actions.receive') }}
            </UButton>
            <UButton
              v-if="availableActions.includes('refund') && auth.can('orders:refund')"
              color="error"
              variant="soft"
              icon="i-lucide-undo-2"
              data-testid="return-refund"
              @click="openRefund"
            >
              {{ $t('admin.returns.actions.refund') }}
            </UButton>
          </div>
        </header>

        <div class="grid gap-6 md:grid-cols-2">
          <!-- Request context -->
          <UCard>
            <template #header>
              <h2 class="font-semibold">
                {{ $t('admin.returns.detail.request') }}
              </h2>
            </template>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ $t('admin.returns.fields.order') }}
                </dt>
                <dd>
                  <ULink
                    :to="localePath(`/admin/orders/${ret.order_id}`)"
                    class="font-mono text-primary"
                    data-testid="return-order-link"
                  >
                    {{ ret.order_number ?? `#${ret.order_id}` }}
                  </ULink>
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ $t('admin.returns.fields.customer') }}
                </dt>
                <dd>{{ ret.customer_email ?? '—' }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ $t('admin.returns.fields.requested') }}
                </dt>
                <dd>{{ formatDate(ret.created_at) }}</dd>
              </div>
              <div
                v-if="ret.refund_id"
                class="flex justify-between gap-4"
              >
                <dt class="text-muted">
                  {{ $t('admin.returns.detail.refundId') }}
                </dt>
                <dd class="font-mono">
                  #{{ ret.refund_id }}
                </dd>
              </div>
            </dl>
            <p
              v-if="ret.comment"
              class="mt-3 text-sm"
              data-testid="return-customer-comment"
            >
              <span class="text-muted">{{ $t('admin.returns.detail.customerComment') }}:</span>
              {{ ret.comment }}
            </p>
            <p
              v-if="ret.admin_note"
              class="mt-2 text-sm"
              data-testid="return-admin-note"
            >
              <span class="text-muted">{{ $t('admin.returns.detail.adminNote') }}:</span>
              {{ ret.admin_note }}
            </p>
          </UCard>

          <!-- Timeline -->
          <UCard>
            <template #header>
              <h2 class="font-semibold">
                {{ $t('admin.returns.detail.timeline') }}
              </h2>
            </template>
            <ol class="space-y-2 text-sm">
              <li
                v-for="event in timeline"
                :key="event.key"
                class="flex items-center justify-between gap-4"
                :data-testid="`return-timeline-${event.key}`"
              >
                <span class="flex items-center gap-2">
                  <UBadge
                    :color="event.key === 'requested' ? 'primary' : returnStatusColor(ret.status)"
                    variant="subtle"
                    size="sm"
                  >
                    {{ $t(`admin.returns.status.${event.key}`) }}
                  </UBadge>
                </span>
                <span class="text-muted">{{ formatDate(event.date) }}</span>
              </li>
            </ol>
            <p
              v-if="ret.status === 'received'"
              class="mt-3 text-xs text-muted"
            >
              {{ $t('admin.returns.detail.restockAtRefundHint') }}
            </p>
          </UCard>
        </div>

        <!-- Returned items -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.returns.detail.items') }}
            </h2>
          </template>
          <div class="divide-y divide-default">
            <div
              v-for="item in ret.items ?? []"
              :key="item.id"
              class="flex items-center justify-between gap-4 py-2 text-sm"
              :data-testid="`return-item-${item.id}`"
            >
              <div>
                <div class="font-medium">
                  {{ item.product_name ?? '—' }}
                </div>
                <div
                  v-if="item.variant_title"
                  class="text-xs text-muted"
                >
                  {{ item.variant_title }}
                </div>
                <div class="text-xs text-muted">
                  {{ $t(`admin.returns.reasonOptions.${item.reason}`) }}
                </div>
              </div>
              <div class="text-right whitespace-nowrap">
                <div>
                  {{ item.quantity }} &times; {{ money(item.unit_price ?? 0) }}
                </div>
                <div class="text-muted">
                  {{ money(item.line_subtotal ?? (item.unit_price ?? 0) * item.quantity) }}
                </div>
              </div>
            </div>
          </div>
          <template #footer>
            <dl class="space-y-1 text-sm ml-auto w-full max-w-xs">
              <div class="flex justify-between font-semibold">
                <dt>{{ $t('admin.returns.detail.lineTotal') }}</dt>
                <dd data-testid="return-line-total">
                  {{ money(lineTotal) }}
                </dd>
              </div>
            </dl>
          </template>
        </UCard>
      </template>

      <!-- Approve / reject / receive modal -->
      <UModal
        :open="actionOpen"
        :title="$t(`admin.returns.actionModal.${actionMode}.title`)"
        :description="$t(`admin.returns.actionModal.${actionMode}.body`)"
        :dismissible="!transitionMutation.isLoading.value"
        @update:open="(v) => { actionOpen = v; if (!v) actionError = '' }"
      >
        <template #body>
          <UAlert
            v-if="actionError"
            role="alert"
            color="error"
            variant="soft"
            class="mb-4"
            :title="t('messages.saveErrorTitle')"
            :description="actionError"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="actionError = ''"
          />
          <UFormField :label="$t('admin.returns.actionModal.adminNote')">
            <UTextarea
              v-model="adminNoteModel"
              :rows="3"
              :placeholder="$t('admin.returns.actionModal.adminNotePlaceholder')"
              class="w-full"
              data-testid="return-action-note"
            />
            <p class="mt-1 text-xs text-muted">
              {{ $t('admin.returns.actionModal.adminNoteHint') }}
            </p>
          </UFormField>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="transitionMutation.isLoading.value"
              @click="() => { actionOpen = false }"
            >
              {{ $t('admin.returns.actionModal.dismiss') }}
            </UButton>
            <UButton
              :color="actionMode === 'reject' ? 'error' : 'primary'"
              :loading="transitionMutation.isLoading.value"
              data-testid="return-action-confirm"
              @click="onActionConfirm"
            >
              {{ $t(`admin.returns.actionModal.${actionMode}.confirm`) }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Refund-from-return dialog -->
      <UModal
        :open="refundOpen"
        :title="$t('admin.returns.refundModal.title')"
        :description="$t('admin.returns.refundModal.description')"
        :dismissible="!refundMutation.isLoading.value"
        @update:open="(v) => { refundOpen = v; if (!v) refundError = '' }"
      >
        <template #body>
          <UAlert
            v-if="refundError"
            role="alert"
            color="error"
            variant="soft"
            class="mb-4"
            :title="t('messages.saveErrorTitle')"
            :description="refundError"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="refundError = ''"
          />
          <div class="space-y-5">
            <UFormField :label="$t('admin.returns.refundModal.amount')">
              <UInputNumber
                v-model="refundAmount"
                :min="0.01"
                :step="0.01"
                class="w-full"
                data-testid="return-refund-amount"
              />
              <p class="mt-1 text-xs text-muted">
                {{ $t('admin.returns.refundModal.amountHint', { total: money(lineTotal) }) }}
              </p>
            </UFormField>

            <UFormField
              :label="$t('admin.returns.refundModal.reason')"
              required
            >
              <USelect
                v-model="refundReason"
                :items="refundReasonOptions"
                value-key="value"
                class="w-full"
                data-testid="return-refund-reason"
              />
            </UFormField>

            <UFormField :label="$t('admin.returns.refundModal.note')">
              <UTextarea
                v-model="refundNote"
                :rows="3"
                :maxlength="500"
                :placeholder="$t('admin.returns.refundModal.notePlaceholder')"
                class="w-full"
                data-testid="return-refund-note"
              />
            </UFormField>

            <UCheckbox
              v-model="refundRestock"
              :label="$t('admin.returns.refundModal.restock')"
              :description="$t('admin.returns.refundModal.restockHint')"
              data-testid="return-refund-restock"
            />
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="refundMutation.isLoading.value"
              @click="() => { refundOpen = false }"
            >
              {{ $t('admin.returns.refundModal.cancel') }}
            </UButton>
            <UButton
              color="error"
              icon="i-lucide-undo-2"
              :loading="refundMutation.isLoading.value"
              :disabled="refundAmount <= 0"
              data-testid="return-refund-confirm"
              @click="onRefundConfirm"
            >
              {{ $t('admin.returns.refundModal.submit') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>
