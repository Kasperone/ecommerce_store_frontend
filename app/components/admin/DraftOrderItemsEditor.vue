<script setup lang="ts">
/**
 * Line-items editor for a draft order — a catalog product picker (debounced
 * search → pick → optional variant select → qty + optional price override)
 * plus the existing lines with inline qty/override editing.
 *
 * Unlike `AdminQuoteLineItemsEditor` (free-text rows assembled client-side),
 * every line here is server-managed: the component owns the add/update/remove
 * item mutations (CustomerNotes precedent) and each mutation returns the full
 * updated draft, refetched into the page's detail query via the
 * `['draft-orders']` namespace invalidation — so all money figures
 * (`effective_unit_price` / `line_total` / `subtotal` / `total`) come from
 * the server, never computed locally.
 *
 * A `unit_price_override` input left empty means live catalog pricing; saving
 * a row with an emptied override sends an explicit `null` to clear the pin.
 *
 * Auto-imported as `<AdminDraftOrderItemsEditor>` (pathPrefix prepends `admin/`).
 */
import { useDebounceFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import type { ProductWithCategory } from '#shared/types/api'
import type {
  DraftOrderItemResponse,
  DraftOrderResponse,
} from '~/composables/queries/useDraftOrderQueries'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import { formatMoney, type CurrencyCode } from '#shared/utils/money'

const props = defineProps<{
  draft: DraftOrderResponse
  /** Completed drafts render read-only. */
  disabled?: boolean
}>()

const { t, locale } = useI18n()
const toast = useToast()

const addMutation = useAddDraftOrderItem()
const updateMutation = useUpdateDraftOrderItem()
const removeMutation = useRemoveDraftOrderItem()

// No client-validatable fields here — converge on message + toast only
// (the null form ref makes applyApiError skip field-mapping/scroll).
const noForm = ref<ValidatedFormInstance | null>(null)
const { errorMessage, applyApiError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

// ---------------------------------------------------------------------------
// Product picker (CollectionMembershipEditor pattern: debounced search → pick)
// ---------------------------------------------------------------------------

const searchTerm = ref('')
const debouncedTerm = ref('')
const setDebounced = useDebounceFn((value: string) => {
  debouncedTerm.value = value
}, 300)
watch(searchTerm, value => setDebounced(value))

const searchEnabled = computed(() => debouncedTerm.value.trim().length > 0)
const { data: searchResults, isLoading: searching } = useProductsQuery(() => ({
  search: debouncedTerm.value.trim() || undefined,
  pageSize: 10,
  page: 1,
}))

const candidates = computed<ProductWithCategory[]>(() =>
  searchEnabled.value ? (searchResults.value?.items ?? []) : [],
)

const picked = ref<{ id: number, name: string } | null>(null)
const pickedVariantId = ref<number | null>(null)
const quantity = ref(1)
// Empty string = no override (live catalog pricing) — a plain text-number
// input so "unset" stays representable. UInput with `type="number"` emits a
// number once the field holds one, so the model is string | number.
const overrideInput = ref<string | number>('')

function pick(product: ProductWithCategory) {
  picked.value = { id: product.id, name: product.name }
  pickedVariantId.value = null
  searchTerm.value = ''
  debouncedTerm.value = ''
}

function clearPick() {
  picked.value = null
  pickedVariantId.value = null
  quantity.value = 1
  overrideInput.value = ''
}

// Variants load lazily for the picked product; a product with active variants
// requires one (mirrors the backend's resolve_line_variant 422).
const { data: pickedVariants, isLoading: variantsLoading } = useProductVariantsQuery(
  () => picked.value?.id,
)
const activeVariants = computed(() =>
  (picked.value ? (pickedVariants.value ?? []) : []).filter(v => v.is_active),
)
const variantOptions = computed(() =>
  activeVariants.value.map(v => ({
    label: v.sku ? `${v.title} (${v.sku})` : v.title,
    value: v.id,
  })),
)
const needsVariant = computed(() => activeVariants.value.length > 0)

const canAdd = computed(() =>
  !props.disabled
  && picked.value !== null
  && !variantsLoading.value
  && (!needsVariant.value || pickedVariantId.value !== null)
  && quantity.value >= 1
  && !addMutation.isLoading.value,
)

/** Parse an override input: empty → null (no pin), invalid/negative → undefined. */
function parseOverride(raw: string | number): number | null | undefined {
  const trimmed = String(raw).trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

async function onAdd() {
  if (!canAdd.value || !picked.value) return
  const override = parseOverride(overrideInput.value)
  if (override === undefined) {
    errorMessage.value = t('admin.draftOrders.items.errors.invalidOverride')
    return
  }
  errorMessage.value = ''
  try {
    await addMutation.mutateAsync({
      draftId: props.draft.id,
      body: {
        product_id: picked.value.id,
        variant_id: pickedVariantId.value,
        quantity: quantity.value,
        unit_price_override: override,
      },
    })
    clearPick()
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}

// ---------------------------------------------------------------------------
// Existing lines — per-row qty/override edits, saved via PATCH
// ---------------------------------------------------------------------------

interface RowEdit {
  quantity: number
  override: string | number
}

const rowEdits = ref<Record<number, RowEdit>>({})

watch(
  () => props.draft.items,
  (items) => {
    const next: Record<number, RowEdit> = {}
    for (const item of items ?? []) {
      next[item.id] = {
        quantity: item.quantity,
        override: item.unit_price_override != null ? String(item.unit_price_override) : '',
      }
    }
    rowEdits.value = next
  },
  { immediate: true, deep: true },
)

function isDirty(item: DraftOrderItemResponse): boolean {
  const edit = rowEdits.value[item.id]
  if (!edit) return false
  const original = item.unit_price_override != null ? String(item.unit_price_override) : ''
  return edit.quantity !== item.quantity || String(edit.override).trim() !== original
}

async function onSaveRow(item: DraftOrderItemResponse) {
  const edit = rowEdits.value[item.id]
  if (!edit) return
  const override = parseOverride(edit.override)
  if (override === undefined) {
    errorMessage.value = t('admin.draftOrders.items.errors.invalidOverride')
    return
  }
  errorMessage.value = ''
  try {
    await updateMutation.mutateAsync({
      draftId: props.draft.id,
      itemId: item.id,
      // Explicit null clears the override pin back to live catalog pricing.
      patch: { quantity: edit.quantity, unit_price_override: override },
    })
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}

async function onRemoveRow(item: DraftOrderItemResponse) {
  errorMessage.value = ''
  try {
    await removeMutation.mutateAsync({ draftId: props.draft.id, itemId: item.id })
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}

const busy = computed(() =>
  addMutation.isLoading.value
  || updateMutation.isLoading.value
  || removeMutation.isLoading.value,
)

function money(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return formatMoney(amount, props.draft.currency as CurrencyCode, locale.value)
}

function lineName(item: DraftOrderItemResponse): string {
  if (!item.product_name) return t('admin.draftOrders.items.staleLine')
  return item.variant_title
    ? `${item.product_name} — ${item.variant_title}`
    : item.product_name
}
</script>

<template>
  <div
    class="space-y-4"
    data-testid="draft-order-items"
  >
    <UAlert
      v-if="errorMessage"
      role="alert"
      color="error"
      variant="soft"
      :title="t('messages.saveErrorTitle')"
      :description="errorMessage"
      :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
      data-testid="draft-order-items-error"
      @close="errorMessage = ''"
    />

    <!-- Product picker (open drafts only) -->
    <div
      v-if="!disabled"
      class="space-y-2 rounded-md border border-default bg-elevated px-3 py-3"
    >
      <template v-if="!picked">
        <UInput
          v-model="searchTerm"
          icon="i-lucide-search"
          :placeholder="t('admin.draftOrders.items.searchPlaceholder')"
          :aria-label="t('admin.draftOrders.items.searchPlaceholder')"
          class="w-full"
          data-testid="draft-order-product-search"
        />
        <div
          v-if="searchEnabled"
          class="border border-default rounded-md divide-y divide-default max-h-56 overflow-y-auto"
          data-testid="draft-order-product-results"
        >
          <div
            v-if="searching"
            class="text-muted text-sm py-3 text-center"
          >
            {{ t('admin.draftOrders.items.searching') }}
          </div>
          <p
            v-else-if="candidates.length === 0"
            class="text-muted text-sm py-3 px-3"
          >
            {{ t('admin.draftOrders.items.noResults') }}
          </p>
          <button
            v-for="product in candidates"
            v-else
            :key="product.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-elevated"
            :data-testid="`draft-order-product-${product.id}`"
            @click="pick(product)"
          >
            <span class="truncate">{{ product.name }}</span>
            <UIcon
              name="i-lucide-plus"
              class="size-4 shrink-0 text-muted"
            />
          </button>
        </div>
      </template>

      <template v-else>
        <div class="flex items-center justify-between gap-3">
          <span
            class="font-medium text-sm truncate"
            data-testid="draft-order-picked-name"
          >{{ picked.name }}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="t('admin.draftOrders.items.clearPick')"
            data-testid="draft-order-picked-clear"
            @click="clearPick"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] items-end gap-3">
          <UFormField
            v-if="variantsLoading || needsVariant"
            :label="t('admin.draftOrders.items.variant')"
            class="min-w-0"
          >
            <USelect
              v-model.nullable="pickedVariantId"
              :items="variantOptions"
              value-key="value"
              :loading="variantsLoading"
              :placeholder="t('admin.draftOrders.items.variantPlaceholder')"
              class="w-full"
              data-testid="draft-order-variant-select"
            />
          </UFormField>
          <div
            v-else
            class="min-w-0"
          />

          <UFormField :label="t('admin.draftOrders.items.quantity')">
            <UInputNumber
              v-model="quantity"
              :min="1"
              :step="1"
              class="w-28"
              :aria-label="t('admin.draftOrders.items.quantity')"
              data-testid="draft-order-add-quantity"
            />
          </UFormField>

          <UFormField
            :label="t('admin.draftOrders.items.override')"
            :help="t('admin.draftOrders.items.overrideHint')"
          >
            <UInput
              v-model.number="overrideInput"
              type="number"
              min="0"
              step="0.01"
              :placeholder="t('admin.draftOrders.items.overridePlaceholder')"
              class="w-36"
              :aria-label="t('admin.draftOrders.items.override')"
              data-testid="draft-order-add-override"
            />
          </UFormField>

          <UButton
            color="primary"
            icon="i-lucide-plus"
            :loading="addMutation.isLoading.value"
            :disabled="!canAdd"
            data-testid="draft-order-add-item"
            @click="onAdd"
          >
            {{ t('admin.draftOrders.items.add') }}
          </UButton>
        </div>
      </template>
    </div>

    <!-- Existing lines -->
    <p
      v-if="!draft.items || draft.items.length === 0"
      class="text-sm text-muted"
      data-testid="draft-order-items-empty"
    >
      {{ t('admin.draftOrders.items.empty') }}
    </p>
    <div
      v-else
      class="divide-y divide-default"
    >
      <div
        v-for="item in draft.items"
        :key="item.id"
        class="py-3 space-y-2"
        :data-testid="`draft-order-item-${item.id}`"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div
              class="font-medium text-sm truncate"
              :class="{ 'text-error': !item.product_name }"
            >
              {{ lineName(item) }}
            </div>
            <div class="text-xs text-muted mt-0.5">
              {{ t('admin.draftOrders.items.unitPrice') }}:
              <span class="font-mono">{{ money(item.effective_unit_price) }}</span>
              <span
                v-if="item.unit_price_override != null"
                class="ml-1"
              >({{ t('admin.draftOrders.items.overridden') }})</span>
            </div>
          </div>
          <div
            class="font-mono text-sm whitespace-nowrap"
            :data-testid="`draft-order-item-${item.id}-total`"
          >
            {{ money(item.line_total) }}
          </div>
        </div>

        <div
          v-if="!disabled && rowEdits[item.id]"
          class="flex flex-wrap items-center gap-2"
        >
          <UInputNumber
            v-model="rowEdits[item.id]!.quantity"
            :min="1"
            :step="1"
            size="sm"
            class="w-28"
            :aria-label="t('admin.draftOrders.items.quantity')"
            :data-testid="`draft-order-item-${item.id}-quantity`"
          />
          <UInput
            v-model.number="rowEdits[item.id]!.override"
            type="number"
            min="0"
            step="0.01"
            size="sm"
            :placeholder="t('admin.draftOrders.items.overridePlaceholder')"
            class="w-36"
            :aria-label="t('admin.draftOrders.items.override')"
            :data-testid="`draft-order-item-${item.id}-override`"
          />
          <UButton
            v-if="isDirty(item)"
            size="sm"
            color="primary"
            variant="soft"
            icon="i-lucide-save"
            :loading="updateMutation.isLoading.value"
            :disabled="busy"
            :data-testid="`draft-order-item-${item.id}-save`"
            @click="onSaveRow(item)"
          >
            {{ t('admin.draftOrders.items.saveLine') }}
          </UButton>
          <UButton
            size="sm"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="busy"
            :aria-label="t('admin.draftOrders.items.remove')"
            :data-testid="`draft-order-item-${item.id}-remove`"
            @click="onRemoveRow(item)"
          />
        </div>
        <div
          v-else-if="disabled"
          class="text-xs text-muted"
        >
          {{ t('admin.draftOrders.items.quantityShort', { count: item.quantity }) }}
        </div>
      </div>
    </div>

    <!-- Totals (server-computed) -->
    <dl class="space-y-1 text-sm ml-auto w-full max-w-xs border-t border-default pt-2">
      <div class="flex justify-between">
        <dt class="text-muted">
          {{ t('admin.draftOrders.items.subtotal') }}
        </dt>
        <dd
          class="font-mono"
          data-testid="draft-order-subtotal"
        >
          {{ money(draft.subtotal) }}
        </dd>
      </div>
      <div
        v-if="draft.discount > 0"
        class="flex justify-between"
      >
        <dt class="text-muted">
          {{ t('admin.draftOrders.items.discount') }}
        </dt>
        <dd
          class="font-mono"
          data-testid="draft-order-discount"
        >
          −{{ money(draft.discount) }}
        </dd>
      </div>
      <div class="flex justify-between font-semibold border-t border-default pt-1">
        <dt>{{ t('admin.draftOrders.items.total') }}</dt>
        <dd
          class="font-mono"
          data-testid="draft-order-total"
        >
          {{ money(draft.total) }}
        </dd>
      </div>
    </dl>
  </div>
</template>
