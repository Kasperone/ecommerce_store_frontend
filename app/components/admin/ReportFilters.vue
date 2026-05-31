<script setup lang="ts">
/**
 * Reports filter bar: a date range (from/to) + a day|week|month granularity
 * select. Auto-imports as `<AdminReportFilters>` (pathPrefix). Purely
 * presentational — the page owns `useUrlFilters` and patches state on the
 * emitted events ("export = what you filter"). Dates are ISO `YYYY-MM-DD`
 * strings that round-trip through the URL untouched.
 */
import { useI18n } from 'vue-i18n'

type Granularity = 'day' | 'week' | 'month'

const props = defineProps<{
  start?: string
  end?: string
  granularity: Granularity
}>()

const emit = defineEmits<{
  'update:start': [value: string | undefined]
  'update:end': [value: string | undefined]
  'update:granularity': [value: Granularity]
}>()

const { t } = useI18n()

const granularityOptions = computed(() => [
  { label: t('admin.reports.granularity.day'), value: 'day' },
  { label: t('admin.reports.granularity.week'), value: 'week' },
  { label: t('admin.reports.granularity.month'), value: 'month' },
])
</script>

<template>
  <div class="flex items-end gap-3 flex-wrap">
    <UFormField :label="t('admin.reports.filters.dateFrom')">
      <UInput
        type="date"
        :model-value="props.start ?? ''"
        class="w-40"
        :aria-label="t('admin.reports.filters.dateFrom')"
        @update:model-value="(v) => emit('update:start', String(v) || undefined)"
      />
    </UFormField>
    <UFormField :label="t('admin.reports.filters.dateTo')">
      <UInput
        type="date"
        :model-value="props.end ?? ''"
        class="w-40"
        :aria-label="t('admin.reports.filters.dateTo')"
        @update:model-value="(v) => emit('update:end', String(v) || undefined)"
      />
    </UFormField>
    <UFormField :label="t('admin.reports.filters.granularity')">
      <USelect
        :model-value="props.granularity"
        :items="granularityOptions"
        value-key="value"
        class="w-40"
        :aria-label="t('admin.reports.filters.granularity')"
        @update:model-value="(v) => emit('update:granularity', v as Granularity)"
      />
    </UFormField>
  </div>
</template>
