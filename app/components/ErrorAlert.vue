<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'

const props = defineProps<{
  problem: ProblemDetails | null
}>()

const emit = defineEmits<{
  fieldErrors: [errors: Record<string, string[]>]
}>()

watch(
  () => props.problem?.errors,
  (next) => {
    if (next) emit('fieldErrors', next)
  },
  { immediate: true },
)
</script>

<template>
  <UAlert
    v-if="problem"
    role="alert"
    color="error"
    variant="soft"
    :title="problem.title"
    :description="problem.detail && problem.detail !== problem.title ? problem.detail : undefined"
    icon="i-lucide-circle-alert"
  />
</template>
