<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SettingsOf } from '../types'

/**
 * Coupon / promo callout — a highlighted card showing a discount code with an
 * optional heading/body and CTA. The "copy code" button is a client-only
 * convenience (clipboard); the code text itself is server-rendered so the offer
 * is always visible/crawlable.
 */
const props = defineProps<{
  settings?: SettingsOf<'coupon-callout'>
}>()

const { t } = useI18n()

const code = computed(() => props.settings?.coupon_code ?? '')
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch {
    // Clipboard unavailable (insecure context / denied) — the code is visible
    // anyway, so there's nothing to recover.
  }
}
</script>

<template>
  <section
    v-if="code || settings?.heading"
    class="c-coupon-callout-block mx-auto w-full max-w-[2560px] px-4 py-12"
  >
    <div class="flex flex-col items-center gap-4 rounded-lg bg-primary/10 px-6 py-10 text-center ring-1 ring-primary/30">
      <h2
        v-if="settings?.heading"
        class="text-2xl font-bold text-highlighted"
      >
        {{ settings.heading }}
      </h2>
      <p
        v-if="settings?.body"
        class="max-w-xl text-muted"
      >
        {{ settings.body }}
      </p>

      <div
        v-if="code"
        class="flex flex-wrap items-center justify-center gap-3"
      >
        <span class="rounded-md border border-dashed border-primary bg-default px-4 py-2 font-mono text-lg font-semibold tracking-wider text-primary">
          {{ code }}
        </span>
        <ClientOnly>
          <UButton
            size="sm"
            variant="soft"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            @click="copy"
          >
            {{ copied ? t('blocks.coupon.copied') : t('blocks.coupon.copy') }}
          </UButton>
        </ClientOnly>
      </div>

      <UButton
        v-if="settings?.cta_label && settings?.cta_url"
        :to="settings.cta_url"
        size="lg"
        color="primary"
      >
        {{ settings.cta_label }}
      </UButton>
    </div>
  </section>
</template>
