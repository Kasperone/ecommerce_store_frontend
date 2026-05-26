<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ProductResponse } from '#shared/types/api'

const props = defineProps<{
  images: ProductResponse['images']
  name: string
}>()

const sorted = computed(() =>
  [...(props.images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
)

const selected = ref(0)
// Reset the active thumbnail if the gallery's product changes.
watch(sorted, () => {
  selected.value = 0
})

const current = computed(() => sorted.value[selected.value] ?? null)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
      <img
        v-if="current"
        :src="current.url"
        :alt="current.alt_text ?? name"
        class="h-full w-full object-cover"
      >
      <div
        v-else
        class="flex h-full w-full items-center justify-center text-muted"
      >
        <UIcon
          name="i-lucide-image"
          class="size-16"
        />
      </div>
    </div>

    <div
      v-if="sorted.length > 1"
      class="flex flex-wrap gap-2"
    >
      <button
        v-for="(image, index) in sorted"
        :key="image.id"
        type="button"
        class="size-16 overflow-hidden rounded-md border-2 transition-colors"
        :class="index === selected ? 'border-primary' : 'border-transparent hover:border-muted'"
        :aria-label="`${name} — image ${index + 1}`"
        :aria-current="index === selected"
        @click="selected = index"
      >
        <img
          :src="image.url"
          :alt="image.alt_text ?? ''"
          class="h-full w-full object-cover"
        >
      </button>
    </div>
  </div>
</template>
