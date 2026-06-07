<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NuxtError } from '#app'

// Branded error page (SEO blueprint SEO-0.5 / nuxt4-audit E1). Rendered by
// Nuxt for any fatal createError — the response status code is the real one
// (404 / 410 / 5xx), so crawlers see honest statuses while users get branded
// chrome + a recovery path instead of the default Nuxt screen.
const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const localePath = useLocalePath()

// Three copy branches: 404 (never existed), 410 (product/page deactivated —
// the backend's "Gone" for delisted PDPs), and everything else as a generic
// server error. Unknown 4xx falls back to the 404 copy.
const kind = computed<'404' | '410' | '500'>(() => {
  const status = props.error?.statusCode ?? 500
  if (status === 410) return '410'
  if (status >= 400 && status < 500) return '404'
  return '500'
})

const title = computed(() => t(`errorPage.${kind.value}.title`))
const description = computed(() => t(`errorPage.${kind.value}.description`))

useSeoMeta({
  title: () => title.value,
})

// clearError resets Nuxt's error state — without it the app would keep
// re-rendering this page on client-side navigation.
function goHome() {
  void clearError({ redirect: localePath('/') })
}
function browseProducts() {
  void clearError({ redirect: localePath('/products') })
}
</script>

<template>
  <!-- error.vue REPLACES app.vue as the root component, so it must provide
       its own <UApp> (tooltip/toast/locale providers) for the layout chrome. -->
  <UApp>
    <NuxtLayout>
      <div class="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
        <p class="text-6xl font-bold text-primary">
          {{ error?.statusCode ?? 500 }}
        </p>
        <h1 class="mt-4 text-2xl font-semibold">
          {{ title }}
        </h1>
        <p class="mt-2 max-w-md text-muted">
          {{ description }}
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <UButton
            icon="i-lucide-home"
            size="lg"
            data-testid="error-go-home"
            @click="goHome"
          >
            {{ t('errorPage.goHome') }}
          </UButton>
          <UButton
            icon="i-lucide-shopping-bag"
            size="lg"
            variant="outline"
            data-testid="error-browse-products"
            @click="browseProducts"
          >
            {{ t('errorPage.browseProducts') }}
          </UButton>
        </div>
      </div>
    </NuxtLayout>
  </UApp>
</template>
