<script setup lang="ts">
import { z } from 'zod'
import { useClipboard } from '@vueuse/core'
import type {
  GiftCardCurrency,
  GiftCardIssueRequest,
  GiftCardIssueResponse,
} from '~/composables/queries/useGiftCardQueries'

/**
 * Issue a gift card (POST 201), then reveal the plaintext code exactly once.
 *
 * Two phases:
 *  1. The issue form (AdminFormModal, gold-standard validation).
 *  2. A separate, deliberately non-dismissible code panel — the code is hashed
 *     at rest and never retrievable again, so an accidental overlay click or
 *     Escape must not lose it. Only the explicit "Done" button closes it.
 *
 * Datetimes round-trip through `<input type="datetime-local">` (local, no
 * zone) — `toIso` re-attaches the browser zone on submit (coupons pattern).
 */

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  /** Fired with the 201 body (incl. the plaintext code) — test seam. */
  'issued': [card: GiftCardIssueResponse]
}>()

const { t } = useI18n()
const toast = useToast()

const issueGiftCard = useIssueGiftCard()

const CURRENCIES: GiftCardCurrency[] = ['USD', 'PLN', 'EUR']

const state = reactive({
  initial_value: null as number | null,
  currency: 'USD' as GiftCardCurrency,
  expires_at: '',
  recipient_email: '',
  user_id: null as number | null,
  note: '',
  locale: 'en' as 'en' | 'pl',
})
const error = ref<unknown>(null)

// Phase 2: set after a 201; the plaintext code lives only here.
const issuedCard = ref<GiftCardIssueResponse | null>(null)
const codeOpen = ref(false)

const loading = computed(() => issueGiftCard.isLoading.value)

const currencyOptions = computed(() => CURRENCIES.map(c => ({ label: c, value: c })))
const localeOptions = computed(() => [
  { label: t('admin.giftCards.issue.localeEn'), value: 'en' as const },
  { label: t('admin.giftCards.issue.localePl'), value: 'pl' as const },
])

const schema = computed(() =>
  z.object({
    initial_value: z
      .number({ message: t('admin.giftCards.errors.initialValuePositive') })
      .positive(t('admin.giftCards.errors.initialValuePositive')),
    currency: z.enum(CURRENCIES as [GiftCardCurrency, ...GiftCardCurrency[]]),
    expires_at: z.string(),
    recipient_email: z
      .string()
      .email(t('admin.giftCards.errors.recipientEmail'))
      .or(z.literal('')),
    user_id: z.number().int().positive().nullable(),
    note: z.string(),
    locale: z.enum(['en', 'pl']),
  }),
)

function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    state.initial_value = null
    state.currency = 'USD'
    state.expires_at = ''
    state.recipient_email = ''
    state.user_id = null
    state.note = ''
    state.locale = 'en'
  },
  // immediate so an already-open mount resets from a previous session.
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  error.value = null
  const body: GiftCardIssueRequest = {
    initial_value: state.initial_value as number,
    currency: state.currency,
    expires_at: toIso(state.expires_at),
    recipient_email: state.recipient_email.trim() || null,
    user_id: state.user_id,
    note: state.note.trim() || null,
    locale: state.locale,
  }
  try {
    const card = await issueGiftCard.mutateAsync(body)
    toast.add({
      title: t('admin.giftCards.flashes.issued'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    emit('issued', card)
    openModel.value = false
    issuedCard.value = card
    codeOpen.value = true
  }
  catch (err) {
    error.value = err
  }
}

// Clipboard (legacy fallback covers non-secure contexts like plain-http dev).
const { copy, isSupported: clipboardSupported } = useClipboard({ legacy: true })

async function onCopyCode() {
  if (!issuedCard.value) return
  try {
    await copy(issuedCard.value.code)
    toast.add({
      title: t('admin.giftCards.codePanel.copied'),
      color: 'success',
      icon: 'i-lucide-clipboard-check',
    })
  }
  catch {
    toast.add({
      title: t('admin.giftCards.codePanel.copyFailed'),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
}

function onCodeDone() {
  codeOpen.value = false
  // Drop the plaintext code from memory once the admin confirms.
  issuedCard.value = null
}
</script>

<template>
  <div>
    <AdminFormModal
      :open="openModel"
      :title="t('admin.giftCards.issue.title')"
      :submit-label="t('admin.giftCards.issue.submit')"
      :cancel-label="t('admin.giftCards.issue.cancel')"
      :loading="loading"
      :error="error"
      :schema="schema"
      :state="state"
      @update:open="(v) => (openModel = v)"
      @submit="onSubmit"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField
              :label="t('admin.giftCards.issue.initialValue')"
              :help="t('admin.giftCards.issue.initialValueHint')"
              name="initial_value"
              required
            >
              <UInputNumber
                v-model="state.initial_value"
                :min="0"
                :step="0.01"
                class="w-full"
                data-testid="gift-card-initial-value"
              />
            </UFormField>

            <UFormField
              :label="t('admin.giftCards.issue.currency')"
              :help="t('admin.giftCards.issue.currencyHint')"
              name="currency"
              required
            >
              <USelect
                v-model="state.currency"
                :items="currencyOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            :label="t('admin.giftCards.issue.expiresAt')"
            :help="t('admin.giftCards.issue.expiresAtHint')"
            name="expires_at"
          >
            <UInput
              v-model="state.expires_at"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField
              :label="t('admin.giftCards.issue.recipientEmail')"
              :help="t('admin.giftCards.issue.recipientEmailHint')"
              name="recipient_email"
            >
              <UInput
                v-model="state.recipient_email"
                type="email"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="t('admin.giftCards.issue.locale')"
              name="locale"
            >
              <USelect
                v-model="state.locale"
                :items="localeOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            :label="t('admin.giftCards.issue.userId')"
            :help="t('admin.giftCards.issue.userIdHint')"
            name="user_id"
          >
            <UInputNumber
              v-model="state.user_id"
              :min="1"
              :step="1"
              class="w-full sm:w-48"
            />
          </UFormField>

          <UFormField
            :label="t('admin.giftCards.issue.note')"
            name="note"
          >
            <UTextarea
              v-model="state.note"
              :rows="2"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
    </AdminFormModal>

    <!-- Code reveal: dismissible ONLY via the Done button — the plaintext code
         is never shown again by design. -->
    <UModal
      v-model:open="codeOpen"
      :title="t('admin.giftCards.codePanel.title')"
      :dismissible="false"
    >
      <template #body>
        <div
          v-if="issuedCard"
          class="space-y-4"
          data-testid="gift-card-code-panel"
        >
          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :title="t('admin.giftCards.codePanel.warning')"
          />

          <div class="flex items-center gap-2">
            <code
              class="flex-1 text-center text-lg font-mono font-semibold tracking-wider select-all rounded-md border border-default bg-elevated px-3 py-2"
              data-testid="gift-card-code"
            >{{ issuedCard.code }}</code>
            <UButton
              v-if="clipboardSupported"
              color="primary"
              icon="i-lucide-clipboard-copy"
              :aria-label="t('admin.giftCards.codePanel.copy')"
              data-testid="gift-card-copy-code"
              @click="onCopyCode"
            >
              {{ t('admin.giftCards.codePanel.copy') }}
            </UButton>
          </div>

          <p
            v-if="issuedCard.recipient_email"
            class="text-sm text-muted"
          >
            {{ t('admin.giftCards.codePanel.emailedTo', { email: issuedCard.recipient_email }) }}
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end w-full">
          <UButton
            color="neutral"
            variant="soft"
            data-testid="gift-card-code-done"
            @click="onCodeDone"
          >
            {{ t('admin.giftCards.codePanel.done') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
