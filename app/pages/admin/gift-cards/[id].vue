<script setup lang="ts">
import { parseProblem } from '#shared/utils/problemDetails'
import { formatMoney, type CurrencyCode } from '#shared/utils/money'
import { adjustErrorKey, giftCardStatusColor, isGiftCardExpired, maskGiftCardCode } from '#shared/utils/giftCard'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const route = useRoute()

const cardId = computed(() => {
  const raw = Number(route.params.id)
  return Number.isInteger(raw) && raw > 0 ? raw : undefined
})

const { data: card, error: loadError, isLoading } = useGiftCardQuery(cardId)

const updateMutation = useUpdateGiftCard()
const adjustMutation = useAdjustGiftCard()

// Modals have no server-mapped field errors to bind, so they converge only the
// error message + toast (null form ref — returns-detail pattern).
const noForm = ref<ValidatedFormInstance | null>(null)
const { errorMessage: editError, applyApiError: applyEditError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})
const { errorMessage: adjustError, applyApiError: applyAdjustError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

// ---------------------------------------------------------------------------
// Status toggle (active ⇄ disabled) — immediate PATCH, no modal.
// ---------------------------------------------------------------------------

const statusError = ref<unknown>(null)

async function onToggleStatus() {
  if (!card.value) return
  const next = card.value.status === 'active' ? 'disabled' : 'active'
  statusError.value = null
  try {
    await updateMutation.mutateAsync({ id: card.value.id, patch: { status: next } })
    toast.add({
      title: t(next === 'disabled' ? 'admin.giftCards.flashes.disabled' : 'admin.giftCards.flashes.enabled'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    statusError.value = err
  }
}

// ---------------------------------------------------------------------------
// Edit modal — expires_at + note. `GiftCardUpdate` applies explicit nulls, so
// clearing the datetime input removes the expiry (hint copy says so).
// ---------------------------------------------------------------------------

const editOpen = ref(false)
const editExpiresAt = ref('')
const editNote = ref('')

// `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in local time
// (coupons pattern): `toLocalInput` strips the ISO zone for display, `toIso`
// re-attaches the browser zone on submit.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function openEdit() {
  if (!card.value) return
  editExpiresAt.value = toLocalInput(card.value.expires_at)
  editNote.value = card.value.note ?? ''
  editError.value = ''
  editOpen.value = true
}

async function onEditConfirm() {
  if (!card.value) return
  editError.value = ''
  try {
    await updateMutation.mutateAsync({
      id: card.value.id,
      patch: {
        expires_at: toIso(editExpiresAt.value),
        note: editNote.value.trim() || null,
      },
    })
    editOpen.value = false
    toast.add({
      title: t('admin.giftCards.flashes.updated'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    applyEditError(err, t('messages.saveError'))
  }
}

// ---------------------------------------------------------------------------
// Adjust modal — signed amount + note. A result below zero 400s with the
// machine code `gift_card_balance_negative`; map it to readable copy.
// ---------------------------------------------------------------------------

const adjustOpen = ref(false)
const adjustAmount = ref<number | null>(null)
const adjustNote = ref('')

function openAdjust() {
  adjustAmount.value = null
  adjustNote.value = ''
  adjustError.value = ''
  adjustOpen.value = true
}

async function onAdjustConfirm() {
  if (!card.value) return
  adjustError.value = ''
  const amount = adjustAmount.value
  if (!amount) {
    adjustError.value = t('admin.giftCards.errors.amountNonZero')
    return
  }
  try {
    await adjustMutation.mutateAsync({
      id: card.value.id,
      body: { amount, note: adjustNote.value.trim() || null },
    })
    adjustOpen.value = false
    toast.add({
      title: t('admin.giftCards.flashes.adjusted'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    const key = adjustErrorKey(parseProblem(err)?.detail)
    if (key) {
      adjustError.value = t(key)
      toast.add({
        title: t('messages.saveErrorTitle'),
        description: t(key),
        color: 'error',
        icon: 'i-lucide-triangle-alert',
      })
    }
    else {
      applyAdjustError(err, t('messages.saveError'))
    }
  }
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

function money(amount: number, currency: string) {
  return formatMoney(amount, currency as CurrencyCode, locale.value)
}

const dateFmt = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }),
)
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.value.format(d)
}

/** Signed ledger amount rendered with an explicit `+` on credits. */
function signedAmount(amount: number, currency: string) {
  return `${amount > 0 ? '+' : ''}${money(amount, currency)}`
}

const maskedCode = computed(() => (card.value ? maskGiftCardCode(card.value.last4) : ''))

useHead({ title: () => t('admin.giftCards.detail.title', { code: maskedCode.value }) })
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-4xl">
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        :padded="false"
        @click="navigateTo(localePath('/admin/gift-cards'))"
      >
        {{ $t('admin.giftCards.actions.back') }}
      </UButton>

      <div
        v-if="isLoading"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.giftCards.detail.loading') }}
      </div>

      <ErrorAlert
        v-else-if="loadError"
        :problem="parseProblem(loadError)"
      />

      <template v-else-if="card">
        <header class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-2xl font-bold font-mono">
              {{ $t('admin.giftCards.detail.title', { code: maskedCode }) }}
            </h1>
            <p class="text-muted text-sm mt-1">
              {{ money(card.balance, card.currency) }}
              <span class="text-xs">/ {{ money(card.initial_value, card.currency) }}</span>
            </p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <UBadge
              :color="giftCardStatusColor(card.status)"
              variant="subtle"
              size="lg"
              data-testid="gift-card-status-badge"
            >
              {{ $t(`admin.giftCards.status.${card.status}`) }}
            </UBadge>
            <UBadge
              v-if="isGiftCardExpired(card.expires_at)"
              color="warning"
              variant="subtle"
              size="lg"
              data-testid="gift-card-expired-badge"
            >
              {{ $t('admin.giftCards.status.expired') }}
            </UBadge>
            <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-scale"
              data-testid="gift-card-adjust"
              @click="openAdjust"
            >
              {{ $t('admin.giftCards.adjust.title') }}
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-pencil"
              data-testid="gift-card-edit"
              @click="openEdit"
            >
              {{ $t('admin.giftCards.actions.edit') }}
            </UButton>
            <UButton
              :color="card.status === 'active' ? 'error' : 'success'"
              variant="soft"
              :icon="card.status === 'active' ? 'i-lucide-ban' : 'i-lucide-check'"
              :loading="updateMutation.isLoading.value"
              data-testid="gift-card-toggle-status"
              @click="onToggleStatus"
            >
              {{ card.status === 'active'
                ? $t('admin.giftCards.actions.disable')
                : $t('admin.giftCards.actions.enable') }}
            </UButton>
          </div>
        </header>

        <ErrorAlert
          v-if="statusError"
          :problem="parseProblem(statusError)"
        />

        <!-- Card summary -->
        <UCard>
          <dl class="grid gap-x-8 gap-y-1 sm:grid-cols-2 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.giftCards.fields.initialValue') }}
              </dt>
              <dd>{{ money(card.initial_value, card.currency) }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.giftCards.fields.balance') }}
              </dt>
              <dd
                class="font-semibold"
                data-testid="gift-card-balance"
              >
                {{ money(card.balance, card.currency) }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.giftCards.fields.currency') }}
              </dt>
              <dd>{{ card.currency }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.giftCards.fields.expiresAt') }}
              </dt>
              <dd data-testid="gift-card-expires-at">
                {{ formatDate(card.expires_at) }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.giftCards.fields.recipient') }}
              </dt>
              <dd>{{ card.recipient_email ?? '—' }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.giftCards.fields.customer') }}
              </dt>
              <dd>
                <ULink
                  v-if="card.user_id"
                  :to="localePath(`/admin/customers/${card.user_id}`)"
                  class="text-primary"
                  data-testid="gift-card-customer-link"
                >
                  #{{ card.user_id }}
                </ULink>
                <template v-else>
                  —
                </template>
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.giftCards.fields.issuedAt') }}
              </dt>
              <dd>{{ formatDate(card.created_at) }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.giftCards.fields.note') }}
              </dt>
              <dd
                class="text-right"
                data-testid="gift-card-note"
              >
                {{ card.note ?? '—' }}
              </dd>
            </div>
          </dl>
        </UCard>

        <!-- Ledger (newest first, straight from the API) -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.giftCards.detail.ledger') }}
            </h2>
          </template>
          <p
            v-if="card.entries.length === 0"
            class="text-muted text-sm"
          >
            {{ $t('admin.giftCards.detail.ledgerEmpty') }}
          </p>
          <div
            v-else
            class="divide-y divide-default"
          >
            <div
              v-for="entry in card.entries"
              :key="entry.id"
              class="flex items-center justify-between gap-4 py-2 text-sm"
              :data-testid="`gift-card-entry-${entry.id}`"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    {{ $t(`admin.giftCards.ledger.kinds.${entry.kind}`) }}
                  </UBadge>
                  <ULink
                    v-if="entry.order_id"
                    :to="localePath(`/admin/orders/${entry.order_id}`)"
                    class="font-mono text-primary text-xs"
                  >
                    {{ $t('admin.giftCards.ledger.order') }} #{{ entry.order_id }}
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
                  {{ signedAmount(entry.amount, card.currency) }}
                </div>
                <div class="text-xs text-muted">
                  {{ $t('admin.giftCards.ledger.balanceAfter') }}:
                  {{ money(entry.balance_after, card.currency) }}
                  · {{ formatDate(entry.created_at) }}
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </template>

      <!-- Edit expires_at / note -->
      <UModal
        :open="editOpen"
        :title="$t('admin.giftCards.edit.title')"
        :dismissible="!updateMutation.isLoading.value"
        @update:open="(v) => { editOpen = v; if (!v) editError = '' }"
      >
        <template #body>
          <UAlert
            v-if="editError"
            role="alert"
            color="error"
            variant="soft"
            class="mb-4"
            :title="t('messages.saveErrorTitle')"
            :description="editError"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="editError = ''"
          />
          <div class="space-y-5">
            <UFormField
              :label="$t('admin.giftCards.edit.expiresAt')"
              :help="$t('admin.giftCards.edit.expiresAtHint')"
            >
              <UInput
                v-model="editExpiresAt"
                type="datetime-local"
                class="w-full"
                data-testid="gift-card-edit-expires"
              />
            </UFormField>
            <UFormField :label="$t('admin.giftCards.edit.note')">
              <UTextarea
                v-model="editNote"
                :rows="2"
                class="w-full"
                data-testid="gift-card-edit-note"
              />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="updateMutation.isLoading.value"
              @click="() => { editOpen = false }"
            >
              {{ $t('admin.giftCards.edit.cancel') }}
            </UButton>
            <UButton
              color="primary"
              :loading="updateMutation.isLoading.value"
              data-testid="gift-card-edit-confirm"
              @click="onEditConfirm"
            >
              {{ $t('admin.giftCards.edit.save') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Adjust balance -->
      <UModal
        :open="adjustOpen"
        :title="$t('admin.giftCards.adjust.title')"
        :description="$t('admin.giftCards.adjust.hint')"
        :dismissible="!adjustMutation.isLoading.value"
        @update:open="(v) => { adjustOpen = v; if (!v) adjustError = '' }"
      >
        <template #body>
          <UAlert
            v-if="adjustError"
            role="alert"
            color="error"
            variant="soft"
            class="mb-4"
            :title="t('messages.saveErrorTitle')"
            :description="adjustError"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="adjustError = ''"
          />
          <div class="space-y-5">
            <UFormField
              :label="$t('admin.giftCards.adjust.amount')"
              required
            >
              <UInputNumber
                v-model="adjustAmount"
                :step="0.01"
                class="w-full"
                data-testid="gift-card-adjust-amount"
              />
            </UFormField>
            <UFormField :label="$t('admin.giftCards.adjust.note')">
              <UTextarea
                v-model="adjustNote"
                :rows="2"
                class="w-full"
                data-testid="gift-card-adjust-note"
              />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="adjustMutation.isLoading.value"
              @click="() => { adjustOpen = false }"
            >
              {{ $t('admin.giftCards.edit.cancel') }}
            </UButton>
            <UButton
              color="primary"
              :loading="adjustMutation.isLoading.value"
              data-testid="gift-card-adjust-confirm"
              @click="onAdjustConfirm"
            >
              {{ $t('admin.giftCards.adjust.submit') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>
