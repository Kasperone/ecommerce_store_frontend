<script setup lang="ts">
/**
 * Customer "Returns" section on the account order detail page.
 *
 * Privacy-gated mirror of the admin returns surface: shows the request date,
 * status badge, the customer's own comment, and the per-line breakdown
 * (product name + qty + the customer-friendly reason phrase). NEVER renders
 * `admin_note` — the API returns the same shape for both surfaces and the
 * customer view drops it client-side (same convention as the refund `note`).
 *
 * Auto-imported as `<OrdersReturnsSection>` (pathPrefix prepends `orders/`).
 */
import { useI18n } from 'vue-i18n'
import type { ReturnRequestResponse } from '#shared/types/api'
import { returnStatusColor } from '#shared/utils/returnStatus'

const props = defineProps<{
  returns: ReturnRequestResponse[]
}>()

const { t, locale } = useI18n()

const dateFmt = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))

const sorted = computed(() =>
  [...props.returns].sort((a, b) => b.created_at.localeCompare(a.created_at)),
)

function reasonLabel(reason: string): string {
  return t(`orders.returns.reasonOptions.${reason}`, { default: reason })
}
</script>

<template>
  <section
    v-if="returns.length > 0"
    class="rounded-lg border border-info/30 bg-info/5 p-4 dark:bg-info/10"
    data-testid="customer-returns"
  >
    <h2 class="mb-2 font-semibold">
      {{ t('orders.returns.title') }}
    </h2>
    <p class="mb-3 text-sm text-muted">
      {{ t('orders.returns.intro') }}
    </p>

    <ul class="divide-y divide-info/20">
      <li
        v-for="ret in sorted"
        :key="ret.id"
        class="space-y-1.5 py-2 text-sm first:pt-0 last:pb-0"
        :data-testid="`customer-return-${ret.id}`"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="text-xs text-muted">
            {{ t('orders.returns.requestedOn', {
              date: dateFmt.format(new Date(ret.created_at)),
            }) }}
          </div>
          <UBadge
            :color="returnStatusColor(ret.status)"
            variant="subtle"
            size="sm"
          >
            {{ t(`orders.returns.status.${ret.status}`) }}
          </UBadge>
        </div>
        <!-- Per-item breakdown. Privacy-safe: product_name + quantity + reason
             only — admin_note is NEVER rendered to the customer here. -->
        <ul
          v-if="ret.items && ret.items.length > 0"
          class="ml-2 space-y-0.5 text-xs text-muted"
          :data-testid="`customer-return-${ret.id}-items`"
        >
          <li
            v-for="ri in ret.items"
            :key="ri.id"
          >
            •
            {{ t('orders.returns.items.line', {
              name: ri.product_name ?? '—', qty: ri.quantity,
            }) }}
            — {{ reasonLabel(ri.reason) }}
          </li>
        </ul>
        <p
          v-if="ret.comment"
          class="text-xs text-muted italic"
        >
          {{ t('orders.returns.yourComment') }}: {{ ret.comment }}
        </p>
      </li>
    </ul>
  </section>
</template>
