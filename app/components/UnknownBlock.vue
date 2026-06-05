<script setup lang="ts">
/**
 * Fallback for a section whose `type` has no registered block component.
 *
 * Storefront and admin deploy independently — a page published against a newer
 * schema can reference a type an older storefront doesn't know. We render
 * nothing in production (graceful degradation) and a small, clearly-flagged
 * note in dev/preview so authors notice the gap.
 */
defineProps<{
  type?: string
}>()

// Show the diagnostic note everywhere except a production build (covers dev,
// preview, and the test env). `import.meta.dev` alone is false under Vitest.
const isDev = !import.meta.env.PROD
</script>

<template>
  <aside
    v-if="isDev"
    class="mx-auto my-2 w-full max-w-7xl rounded-md border border-dashed border-warning bg-warning/5 px-4 py-3 text-sm text-warning"
    role="note"
  >
    Unknown block type<span v-if="type">: <code class="font-mono">{{ type }}</code></span>
    — no component registered.
  </aside>
  <!-- Production: render nothing. -->
</template>
