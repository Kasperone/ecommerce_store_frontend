<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
// `/pure` defers injecting js.stripe.com until loadStripe() actually runs — the
// bare entry loads it on import (network hit + CSP), which we don't want on a
// settings page where most companies never vault a card. See WalletButton.vue.
import { loadStripe } from '@stripe/stripe-js/pure'
import type { Stripe, StripeElements } from '@stripe/stripe-js'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

/**
 * Company-portal card vaulting for net-terms auto-charge (tail Program C).
 * COMPANY_ADMIN only — the parent gates on `role` + `auto_charge_enabled`.
 *
 * Opens a Stripe SetupIntent, mounts the Payment Element in setup mode (the
 * element auto-detects setup from the SetupIntent client secret), and on submit
 * confirms the SetupIntent in the browser (`redirect: 'if_required'` — a card
 * settles inline, no redirect) then registers the resulting PaymentMethod with
 * the backend. `@changed` tells the parent to refetch the credit summary, whose
 * `auto_charge_card_set` drives the on-file/not state shown here.
 */
defineProps<{
  /** Whether a card is currently vaulted (from the company credit summary). */
  cardSet: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const toast = useToast()
const { data: config } = useStripeConfig()
const createSetupIntent = useCreateAutoChargeSetupIntent()
const confirmAutoCharge = useConfirmAutoCharge()
const removeAutoCharge = useRemoveAutoCharge()

const mountEl = ref<HTMLElement | null>(null)
const showForm = ref(false)
const submitting = ref(false)
const removing = ref(false)
const error = ref<ProblemDetails | null>(null)

let stripe: Stripe | null = null
let elements: StripeElements | null = null

async function startSetup() {
  error.value = null
  const cfg = config.value
  if (!cfg?.configured || !cfg.publishable_key) {
    error.value = { title: t('account.settings.company.autoCharge.stripeUnavailable') }
    return
  }
  showForm.value = true
  // Wait for the v-if mount node to render before Stripe attaches to it.
  await nextTick()
  try {
    const { client_secret } = await createSetupIntent.mutateAsync()
    stripe = await loadStripe(cfg.publishable_key)
    if (!stripe || !mountEl.value) {
      error.value = { title: t('account.settings.company.autoCharge.stripeUnavailable') }
      showForm.value = false
      return
    }
    elements = stripe.elements({ clientSecret: client_secret })
    elements.create('payment').mount(mountEl.value)
  }
  catch (err) {
    error.value = parseProblem(err)
    cleanup()
  }
}

async function submitCard() {
  if (!stripe || !elements) return
  error.value = null
  submitting.value = true
  try {
    const { error: submitError } = await elements.submit()
    if (submitError) {
      error.value = { title: submitError.message || t('account.settings.company.autoCharge.error') }
      return
    }
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      // A card settles without a redirect; return_url is only used if the chosen
      // method insists on redirecting (then the parent page reloads back here).
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (confirmError) {
      error.value = { title: confirmError.message || t('account.settings.company.autoCharge.error') }
      return
    }
    if (!setupIntent?.id) {
      error.value = { title: t('account.settings.company.autoCharge.error') }
      return
    }
    await confirmAutoCharge.mutateAsync(setupIntent.id)
    toast.add({ title: t('account.settings.company.autoCharge.saved'), color: 'success' })
    cleanup()
    emit('changed')
  }
  catch (err) {
    error.value = parseProblem(err)
  }
  finally {
    submitting.value = false
  }
}

async function removeCard() {
  error.value = null
  removing.value = true
  try {
    await removeAutoCharge.mutateAsync()
    toast.add({ title: t('account.settings.company.autoCharge.removed'), color: 'success' })
    emit('changed')
  }
  catch (err) {
    error.value = parseProblem(err)
  }
  finally {
    removing.value = false
  }
}

function cleanup() {
  elements = null
  stripe = null
  showForm.value = false
}

onBeforeUnmount(cleanup)
</script>

<template>
  <div data-testid="auto-charge-setup">
    <h4 class="font-medium text-sm">
      {{ t('account.settings.company.autoCharge.title') }}
    </h4>
    <p class="mt-1 text-xs text-muted">
      {{ t('account.settings.company.autoCharge.hint') }}
    </p>

    <ErrorAlert
      v-if="error"
      :problem="error"
      class="mt-2"
    />

    <!-- Idle state: show current card status + the primary action. -->
    <div
      v-if="!showForm"
      class="mt-3 flex flex-wrap items-center gap-3"
    >
      <span
        class="inline-flex items-center gap-1 text-sm"
        :class="cardSet ? 'text-success' : 'text-muted'"
        data-testid="auto-charge-status"
      >
        <UIcon :name="cardSet ? 'i-lucide-check-circle' : 'i-lucide-credit-card'" />
        {{ cardSet
          ? t('account.settings.company.autoCharge.cardOnFile')
          : t('account.settings.company.autoCharge.noCard') }}
      </span>
      <UButton
        size="sm"
        color="primary"
        variant="soft"
        :loading="createSetupIntent.isLoading.value"
        data-testid="auto-charge-add"
        @click="startSetup"
      >
        {{ cardSet
          ? t('account.settings.company.autoCharge.replace')
          : t('account.settings.company.autoCharge.setUp') }}
      </UButton>
      <UButton
        v-if="cardSet"
        size="sm"
        color="error"
        variant="ghost"
        :loading="removing"
        data-testid="auto-charge-remove"
        @click="removeCard"
      >
        {{ t('account.settings.company.autoCharge.remove') }}
      </UButton>
    </div>

    <!-- Active setup: the Payment Element + confirm/cancel. -->
    <div
      v-else
      class="mt-3 space-y-3"
    >
      <div ref="mountEl" />
      <div class="flex items-center gap-2">
        <UButton
          size="sm"
          color="primary"
          :loading="submitting"
          data-testid="auto-charge-submit"
          @click="submitCard"
        >
          {{ t('account.settings.company.autoCharge.save') }}
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :disabled="submitting"
          @click="cleanup"
        >
          {{ t('account.settings.company.autoCharge.cancel') }}
        </UButton>
      </div>
    </div>
  </div>
</template>
