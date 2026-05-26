<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

/**
 * Starts the PayU hosted-redirect checkout for a pending order and sends the
 * buyer to PayU's payment page. Used on the post-checkout success page and on
 * the order-detail page for any still-unpaid pending order.
 *
 * On a backend error (503 PayU not configured / 502 upstream / 404 / 409) the
 * message is rendered inline via `<ErrorAlert>` rather than navigating — so an
 * environment without PayU keys degrades to a readable "payments unavailable"
 * notice instead of a dead button.
 */
const props = withDefaults(
  defineProps<{
    orderId: number
    block?: boolean
  }>(),
  { block: false },
)

const { t } = useI18n()
const startCheckout = useStartPayuCheckout()
const error = ref<ProblemDetails | null>(null)

async function pay() {
  error.value = null
  try {
    const { redirect_uri } = await startCheckout.mutateAsync(props.orderId)
    await navigateTo(redirect_uri, { external: true })
  }
  catch (err) {
    error.value = parseProblem(err)
  }
}
</script>

<template>
  <div class="space-y-2">
    <ErrorAlert
      v-if="error"
      :problem="error"
    />
    <UButton
      color="primary"
      icon="i-lucide-credit-card"
      :block="block"
      :loading="startCheckout.isLoading.value"
      @click="pay"
    >
      {{ t('payment.payNow') }}
    </UButton>
  </div>
</template>
