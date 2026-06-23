<script setup lang="ts">
/**
 * InPost Paczkomat (parcel-locker) point picker — wraps the official InPost
 * **Geowidget** web component (`<inpost-geowidget>`), a map + search the buyer
 * uses to pick a specific locker. Shown on `/checkout` only when the chosen
 * shipping method is an InPost locker.
 *
 * Built behind `NUXT_PUBLIC_INPOST_GEOWIDGET_TOKEN` (decision D4 — env-gated, no
 * live verification until the token is supplied):
 * - token set → the script/styles load once and the widget renders; selecting a
 *   point emits `{ id, name }` (locker code + human address) for the order.
 * - token blank → a "not configured" notice; no locker can be chosen (the
 *   parent disables the order button so the backend's locker-required 422 is
 *   never hit).
 *
 * Auto-imported as `<CheckoutInpostPointPicker>`. Client-only (the widget is a
 * browser web component) — wrap usage in `<ClientOnly>`.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const GEOWIDGET_JS = 'https://geowidget.inpost.pl/inpost-geowidget.js'
const GEOWIDGET_CSS = 'https://geowidget.inpost.pl/inpost-geowidget.css'

const emit = defineEmits<{
  /** A locker was picked: its code (`id`) + human address (`name`). */
  select: [point: { id: string, name: string }]
}>()

const { t, locale } = useI18n()
const token = useRuntimeConfig().public.inpostGeowidgetToken as string
const configured = !!token

const widgetEl = ref<HTMLElement | null>(null)
const selected = ref<{ id: string, name: string } | null>(null)

// Load the Geowidget assets once (idempotent — useHead dedupes by key).
if (configured) {
  useHead({
    link: [{ rel: 'stylesheet', href: GEOWIDGET_CSS, key: 'inpost-geowidget-css' }],
    script: [{ src: GEOWIDGET_JS, defer: true, key: 'inpost-geowidget-js' }],
  })
}

// The widget dispatches `onpoint` with the chosen point in `event.detail`. Its
// `name` is the locker code (e.g. KRA010); the address fields compose the human
// line shown on the order/label.
function onPoint(event: Event) {
  const detail = (event as CustomEvent).detail as
    | { name?: string, address?: { line1?: string, line2?: string } }
    | undefined
  if (!detail?.name) return
  const addr = [detail.address?.line1, detail.address?.line2].filter(Boolean).join(', ')
  const point = { id: detail.name, name: addr || detail.name }
  selected.value = point
  emit('select', point)
}

onMounted(() => {
  widgetEl.value?.addEventListener('onpoint', onPoint)
})
</script>

<template>
  <div
    class="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
    data-testid="inpost-point-picker"
  >
    <p class="mb-2 text-sm font-medium">
      {{ t('checkout.inpost.heading') }}
    </p>

    <template v-if="configured">
      <p
        v-if="selected"
        class="mb-2 text-sm text-muted"
      >
        {{ t('checkout.inpost.selected', { point: selected.id }) }} — {{ selected.name }}
      </p>
      <p
        v-else
        class="mb-2 text-sm text-muted"
      >
        {{ t('checkout.inpost.prompt') }}
      </p>
      <!-- eslint-disable-next-line vue/no-undef-components -- InPost web component -->
      <inpost-geowidget
        ref="widgetEl"
        :token="token"
        :language="locale"
        config="parcelCollect"
        class="block h-96 w-full"
      />
    </template>

    <p
      v-else
      class="text-sm text-muted"
    >
      {{ t('checkout.inpost.notConfigured') }}
    </p>
  </div>
</template>
