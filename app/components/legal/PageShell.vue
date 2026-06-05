<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * Shared shell for the static legal / info pages. Renders the page title,
 * an intro paragraph, the mandatory "Draft — review by legal counsel" notice,
 * and a back-to-home link, then yields the body via the default slot.
 */
defineProps<{
  title: string
  intro?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <UContainer class="c-legal-page py-12 md:py-16">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-3xl font-bold mb-4">
        {{ title }}
      </h1>

      <UAlert
        class="mb-8"
        color="warning"
        variant="soft"
        icon="i-lucide-info"
        :title="t('legal.draftNotice.title')"
        :description="t('legal.draftNotice.body')"
      />

      <p
        v-if="intro"
        class="text-lg text-muted mb-8"
      >
        {{ intro }}
      </p>

      <div class="space-y-8">
        <slot />
      </div>

      <div class="mt-12 pt-6 border-t border-default">
        <ULink
          :to="localePath('/')"
          class="text-primary font-medium"
        >← {{ t('legal.backHome') }}</ULink>
      </div>
    </div>
  </UContainer>
</template>
