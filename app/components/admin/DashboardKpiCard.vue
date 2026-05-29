<script setup lang="ts">
/**
 * A single dashboard KPI card: a label, a primary value, optional secondary
 * lines (used for per-currency money figures), an optional muted hint, and an
 * optional accent icon. Purely presentational.
 */
import { computed } from 'vue'

interface Props {
  label: string
  value: string
  icon?: string
  hint?: string
  lines?: string[]
  accent?: 'primary' | 'success' | 'warning' | 'error' | 'neutral'
}

const props = withDefaults(defineProps<Props>(), {
  icon: undefined,
  hint: undefined,
  lines: () => [],
  accent: 'neutral',
})

const accentClass = computed(
  () =>
    ({
      primary: 'text-primary',
      success: 'text-success',
      warning: 'text-warning',
      error: 'text-error',
      neutral: 'text-muted',
    })[props.accent],
)
</script>

<template>
  <UCard>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs uppercase tracking-wide text-muted">
          {{ label }}
        </p>
        <p class="text-2xl font-bold tabular-nums mt-1 truncate">
          {{ value }}
        </p>
        <p
          v-for="line in lines"
          :key="line"
          class="text-sm text-muted tabular-nums truncate"
        >
          {{ line }}
        </p>
        <p
          v-if="hint"
          class="text-xs text-muted mt-1"
        >
          {{ hint }}
        </p>
      </div>
      <UIcon
        v-if="icon"
        :name="icon"
        class="text-2xl shrink-0"
        :class="accentClass"
      />
    </div>
  </UCard>
</template>
