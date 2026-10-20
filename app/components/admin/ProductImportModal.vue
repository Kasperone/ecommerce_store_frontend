<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '@nuxt/ui'
import { parseProblem } from '#shared/utils/problemDetails'
import type {
  ProductImportAction,
  ProductImportReport,
  ProductImportRow,
} from '~/composables/queries/useProductQueries'

/**
 * Product CSV import modal — two-phase UX:
 *  1. Pick a CSV → import with `dry_run=true` → render the report (summary
 *     counts + a per-row table). Nothing is written.
 *  2. "Apply N changes" → import with `dry_run=false` (all-or-nothing). Blocked
 *     when the dry-run report has errors or nothing to apply. On success a toast
 *     + the product list is invalidated by the mutation, then we close.
 */

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { t } = useI18n()
const toast = useToast()

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const { mutateAsync: runImport, isLoading } = useImportProducts()

const file = ref<File | null>(null)
const report = ref<ProductImportReport | null>(null)
const applied = ref(false)
// Which mutation is in flight, so each button shows its own spinner.
const phase = ref<'idle' | 'dryRun' | 'apply'>('idle')

const summary = computed(() => report.value?.summary ?? null)

const summaryBadges = computed(() => {
  const s = summary.value
  return [
    { key: 'creates', color: 'success' as const, label: t('admin.products.csv.import.summary.creates', { count: s?.creates ?? 0 }) },
    { key: 'updates', color: 'info' as const, label: t('admin.products.csv.import.summary.updates', { count: s?.updates ?? 0 }) },
    { key: 'skips', color: 'neutral' as const, label: t('admin.products.csv.import.summary.skips', { count: s?.skips ?? 0 }) },
    { key: 'errors', color: (hasErrors.value ? 'error' : 'neutral') as 'error' | 'neutral', label: t('admin.products.csv.import.summary.errors', { count: s?.errors ?? 0 }) },
  ]
})
const changeCount = computed(() =>
  summary.value ? summary.value.creates + summary.value.updates : 0,
)
const hasErrors = computed(() => (summary.value?.errors ?? 0) > 0)
const canApply = computed(() => !hasErrors.value && changeCount.value > 0 && !applied.value)

function reset() {
  file.value = null
  report.value = null
  applied.value = false
  phase.value = 'idle'
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  // A new file invalidates any prior preview.
  report.value = null
  applied.value = false
}

async function runDryRun() {
  if (!file.value) return
  phase.value = 'dryRun'
  try {
    report.value = await runImport({ file: file.value, dryRun: true })
    applied.value = false
  }
  catch (err) {
    const problem = parseProblem(err)
    toast.add({
      title: t('admin.products.csv.import.error'),
      description: problem?.detail,
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    phase.value = 'idle'
  }
}

async function applyChanges() {
  if (!file.value || !canApply.value) return
  phase.value = 'apply'
  try {
    const result = await runImport({ file: file.value, dryRun: false })
    if (result.summary.errors > 0) {
      // All-or-nothing: the apply rolled back; surface the new error report.
      report.value = result
      applied.value = false
      toast.add({
        title: t('admin.products.csv.import.applyFailed'),
        color: 'error',
        icon: 'i-lucide-alert-circle',
      })
      return
    }
    applied.value = true
    toast.add({
      title: t('admin.products.csv.import.applied', {
        creates: result.summary.creates,
        updates: result.summary.updates,
      }),
      color: 'success',
      icon: 'i-lucide-check',
    })
    openModel.value = false
    reset()
  }
  catch (err) {
    const problem = parseProblem(err)
    toast.add({
      title: t('admin.products.csv.import.error'),
      description: problem?.detail,
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
  finally {
    if (!applied.value) phase.value = 'idle'
  }
}

function onClose() {
  openModel.value = false
  reset()
}

const actionColor: Record<ProductImportAction, 'success' | 'info' | 'neutral' | 'error'> = {
  create: 'success',
  update: 'info',
  skip: 'neutral',
  error: 'error',
}

const columns: TableColumn<ProductImportRow>[] = [
  { accessorKey: 'row_number', header: () => t('admin.products.csv.import.cols.row') },
  { accessorKey: 'action', header: () => t('admin.products.csv.import.cols.action') },
  { accessorKey: 'product_id', header: () => t('admin.products.csv.import.cols.productId') },
  { accessorKey: 'errors', header: () => t('admin.products.csv.import.cols.errors') },
]
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="t('admin.products.csv.import.title')"
    :description="t('admin.products.csv.import.description')"
    :ui="{ content: 'max-w-3xl' }"
    @update:open="(v) => { if (!v) reset() }"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.products.csv.import.fileLabel')"
          :help="t('admin.products.csv.import.fileHelp')"
        >
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            class="block w-full text-sm file:mr-3 file:rounded file:border-0
              file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-700
              dark:file:bg-primary-950 dark:file:text-primary-300"
            @change="onFileChange"
          >
        </UFormField>

        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-search-check"
          :loading="phase === 'dryRun'"
          :disabled="!file || isLoading"
          @click="runDryRun"
        >
          {{ t('admin.products.csv.import.dryRunButton') }}
        </UButton>

        <ClientOnly>
          <div
            v-if="report"
            class="space-y-3"
          >
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="badge in summaryBadges"
                :key="badge.key"
                :color="badge.color"
                variant="subtle"
              >
                {{ badge.label }}
              </UBadge>
            </div>

            <UAlert
              v-if="hasErrors"
              color="error"
              variant="soft"
              icon="i-lucide-alert-triangle"
              :title="t('admin.products.csv.import.errorsTitle')"
              :description="t('admin.products.csv.import.errorsHint')"
            />

            <UTable
              :data="report.rows"
              :columns="columns"
              :ui="{ td: 'align-top' }"
            >
              <template #row_number-cell="{ row }">
                <span class="font-mono text-sm">{{ row.original.row_number }}</span>
              </template>
              <template #action-cell="{ row }">
                <UBadge
                  :color="actionColor[row.original.action]"
                  variant="subtle"
                >
                  {{ t(`admin.products.csv.import.actions.${row.original.action}`) }}
                </UBadge>
              </template>
              <template #product_id-cell="{ row }">
                <span class="text-sm text-muted">{{ row.original.product_id ?? '—' }}</span>
              </template>
              <template #errors-cell="{ row }">
                <ul
                  v-if="row.original.errors.length"
                  class="text-error-600 dark:text-error-400 text-sm list-disc ml-4 space-y-0.5"
                >
                  <li
                    v-for="(err, i) in row.original.errors"
                    :key="i"
                  >
                    {{ err }}
                  </li>
                </ul>
                <span
                  v-else
                  class="text-muted text-sm"
                >—</span>
              </template>
            </UTable>
          </div>
        </ClientOnly>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="isLoading"
          @click="onClose"
        >
          {{ t('admin.products.csv.import.close') }}
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-upload"
          :loading="phase === 'apply'"
          :disabled="!canApply || isLoading"
          @click="applyChanges"
        >
          {{ t('admin.products.csv.import.applyButton', { count: changeCount }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
