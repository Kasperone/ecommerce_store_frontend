<script setup lang="ts">
/**
 * Repeatable line-item editor for a quote.
 *
 * Each row is a free-text `description` + `quantity` + `unit_price` (the catalog
 * `product_id` link is optional and out of scope for the MVP, so it's left
 * `null`). The editor owns the rows internally and emits the assembled
 * `QuoteItemCreate[]` on every change via `v-model:items` — the parent form just
 * reads the latest array at submit time. The per-line total + the running
 * subtotal are shown for the chosen `currency`.
 *
 * Auto-imported as `<AdminQuoteLineItemsEditor>` (pathPrefix prepends `admin/`).
 */
import { useI18n } from 'vue-i18n'
import type { QuoteItemCreate, QuoteCurrency } from '~/composables/queries/useQuoteQueries'
import { formatMoney } from '#shared/utils/money'

interface EditorRow {
  description: string
  quantity: number
  unitPrice: number
}

const props = defineProps<{
  items: QuoteItemCreate[]
  currency: QuoteCurrency
}>()

const emit = defineEmits<{
  'update:items': [value: QuoteItemCreate[]]
}>()

const { t, locale } = useI18n()

function blankRow(): EditorRow {
  return { description: '', quantity: 1, unitPrice: 0 }
}

// Seed the local rows from the incoming `items` (edit mode) once; subsequent
// edits flow out via the emit below. An empty incoming list starts with one
// blank row so the admin always has something to type into.
const rows = ref<EditorRow[]>(
  props.items.length > 0
    ? props.items.map(i => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unit_price,
      }))
    : [blankRow()],
)

function emitItems() {
  // Drop fully-empty rows (no description) so a trailing blank row the admin
  // never filled in doesn't ride along into the create body.
  const items: QuoteItemCreate[] = rows.value
    .filter(r => r.description.trim() !== '')
    .map(r => ({
      description: r.description.trim(),
      quantity: r.quantity,
      unit_price: r.unitPrice,
      product_id: null,
    }))
  emit('update:items', items)
}

// Deep-watch the rows so any field edit re-emits the assembled body. `rows` is a
// reactive ref over an array of plain objects, so a getter + deep is required.
watch(rows, emitItems, { deep: true })
// Emit once on mount so the parent has the seeded body even before any edit.
onMounted(emitItems)

function addRow() {
  rows.value.push(blankRow())
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  // Never leave the editor with zero rows — keep one blank for the next entry.
  if (rows.value.length === 0) rows.value.push(blankRow())
}

function lineTotal(row: EditorRow): number {
  return (row.quantity || 0) * (row.unitPrice || 0)
}

const subtotal = computed(() =>
  rows.value.reduce((acc, r) => acc + lineTotal(r), 0),
)

function money(amount: number): string {
  return formatMoney(amount, props.currency, locale.value)
}
</script>

<template>
  <div
    class="space-y-3"
    data-testid="quote-line-items"
  >
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] items-end gap-3 rounded-md border border-default bg-elevated px-3 py-3"
      :data-testid="`quote-line-${index}`"
    >
      <UFormField
        :label="index === 0 ? t('admin.quotes.lineItems.description') : undefined"
        class="min-w-0"
      >
        <UInput
          v-model="row.description"
          :placeholder="t('admin.quotes.lineItems.descriptionPlaceholder')"
          class="w-full"
          :data-testid="`quote-line-${index}-description`"
        />
      </UFormField>

      <UFormField :label="index === 0 ? t('admin.quotes.lineItems.quantity') : undefined">
        <UInputNumber
          v-model="row.quantity"
          :min="1"
          :step="1"
          class="w-28"
          :data-testid="`quote-line-${index}-quantity`"
          :aria-label="t('admin.quotes.lineItems.quantity')"
        />
      </UFormField>

      <UFormField :label="index === 0 ? t('admin.quotes.lineItems.unitPrice') : undefined">
        <UInputNumber
          v-model="row.unitPrice"
          :min="0"
          :step="0.01"
          class="w-32"
          :data-testid="`quote-line-${index}-unit-price`"
          :aria-label="t('admin.quotes.lineItems.unitPrice')"
        />
      </UFormField>

      <UFormField :label="index === 0 ? t('admin.quotes.lineItems.lineTotal') : undefined">
        <div
          class="font-mono text-sm py-2 whitespace-nowrap text-right w-28"
          :data-testid="`quote-line-${index}-total`"
        >
          {{ money(lineTotal(row)) }}
        </div>
      </UFormField>

      <UButton
        color="error"
        variant="ghost"
        icon="i-lucide-trash-2"
        size="sm"
        :aria-label="t('admin.quotes.lineItems.remove')"
        :data-testid="`quote-line-${index}-remove`"
        @click="removeRow(index)"
      />
    </div>

    <div class="flex items-center justify-between gap-4">
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        size="sm"
        data-testid="quote-line-add"
        @click="addRow"
      >
        {{ t('admin.quotes.lineItems.add') }}
      </UButton>
      <div class="text-sm">
        <span class="text-muted">{{ t('admin.quotes.lineItems.subtotal') }}</span>
        <span
          class="ml-2 font-mono font-semibold"
          data-testid="quote-line-subtotal"
        >{{ money(subtotal) }}</span>
      </div>
    </div>
  </div>
</template>
