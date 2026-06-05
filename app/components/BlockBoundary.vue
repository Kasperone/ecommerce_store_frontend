<script setup lang="ts">
/**
 * Per-block error boundary.
 *
 * Wraps each rendered block in `<NuxtErrorBoundary>` so a single throwing block
 * (e.g. a referenced product deleted after publish) can't blank the whole page.
 * In production the failed block renders nothing; in dev/preview we surface the
 * error + the block `type` so authors can debug. Server-side validation at
 * publish keeps this boundary a last-resort net.
 */
defineProps<{
  type?: string
}>()

// Surface the failure everywhere except a production build (dev/preview/test).
// `import.meta.dev` alone is false under Vitest.
const isDev = !import.meta.env.PROD
</script>

<template>
  <NuxtErrorBoundary>
    <slot />

    <template #error="{ error, clearError }">
      <aside
        v-if="isDev"
        class="mx-auto my-2 w-full max-w-7xl rounded-md border border-dashed border-error bg-error/5 px-4 py-3 text-sm text-error"
        role="alert"
      >
        <p class="font-medium">
          Block failed to render<span v-if="type">: <code class="font-mono">{{ type }}</code></span>
        </p>
        <p class="mt-1 break-words opacity-80">
          {{ (error as Error)?.message ?? String(error) }}
        </p>
        <UButton
          size="xs"
          variant="soft"
          color="error"
          class="mt-2"
          @click="clearError"
        >
          Retry
        </UButton>
      </aside>
      <!-- Production: a failed block renders nothing. -->
    </template>
  </NuxtErrorBoundary>
</template>
