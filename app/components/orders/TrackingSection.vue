<script setup lang="ts">
/**
 * "Shipment" tracking block shared by the customer and admin order detail
 * pages. Renders only when at least one tracking field is set (the backend
 * normalizes blank strings to null, so set = non-null). Shows the carrier +
 * tracking number and a "Track shipment" external link when `trackingUrl`
 * is present.
 *
 * Auto-imported as `<OrdersTrackingSection>` (pathPrefix prepends `orders/`).
 */
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  shippingCarrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
}>()

const { t } = useI18n()

const hasTracking = computed(() =>
  Boolean(props.shippingCarrier || props.trackingNumber || props.trackingUrl),
)
</script>

<template>
  <section
    v-if="hasTracking"
    class="rounded-lg border border-primary/30 bg-primary/5 p-4 dark:bg-primary/10"
    data-testid="order-tracking"
  >
    <h2 class="mb-2 font-semibold">
      {{ t('orders.tracking.title') }}
    </h2>
    <dl class="space-y-1 text-sm">
      <div
        v-if="shippingCarrier"
        class="flex justify-between gap-4"
      >
        <dt class="text-muted">
          {{ t('orders.tracking.carrier') }}
        </dt>
        <dd>{{ shippingCarrier }}</dd>
      </div>
      <div
        v-if="trackingNumber"
        class="flex justify-between gap-4"
      >
        <dt class="text-muted">
          {{ t('orders.tracking.number') }}
        </dt>
        <dd class="font-mono">
          {{ trackingNumber }}
        </dd>
      </div>
    </dl>
    <UButton
      v-if="trackingUrl"
      :to="trackingUrl"
      external
      target="_blank"
      rel="noopener noreferrer"
      color="primary"
      variant="soft"
      size="sm"
      icon="i-lucide-external-link"
      class="mt-3"
      data-testid="order-tracking-link"
    >
      {{ t('orders.tracking.track') }}
    </UButton>
  </section>
</template>
