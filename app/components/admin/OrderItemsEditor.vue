<script setup lang="ts">
/**
 * Edit mode for a PENDING order's line items. Unlike the draft-order editor
 * (server-managed per-line mutations), this builds the full desired line set
 * locally and sends ONE `PATCH /orders/{id}/items` — the backend recomputes
 * subtotal/total, reconciles stock, and writes an `edited` timeline event.
 *
 * WYSIWYG pricing: every line pins its shown unit price (`unit_price_override`),
 * so what the admin sees is exactly what's saved. Totals shown here are a
 * client-side preview; the authoritative figures come back on save (the order
 * detail + timeline queries are invalidated).
 */
import { useDebounceFn } from '@vueuse/core'
import type { OrderWithUser, ProductWithCategory, OrderEditRequest } from '#shared/types/api'
import { formatMoney, selectPrice, type CurrencyCode } from '#shared/utils/money'
import { parseProblem } from '#shared/utils/problemDetails'

const props = defineProps<{ order: OrderWithUser }>()
const emit = defineEmits<{ saved: [], cancel: [] }>()

const { t, locale } = useI18n()
const toast = useToast()

const currency = computed(() => props.order.currency as CurrencyCode)
const editMutation = useEditOrderItems()

interface EditLine {
  key: string
  productId: number
  variantId: number | null
  name: string
  unitPrice: number
  quantity: number
}

let keySeq = 0
const nextKey = () => `line-${keySeq++}`

const lines = ref<EditLine[]>([])
const discount = ref<number>(0)
const shippingMethodId = ref<number | null>(null)
const formError = ref('')

// Seed local state from the order whenever it changes.
watch(
  () => props.order,
  (order) => {
    lines.value = (order.items ?? []).map(it => ({
      key: nextKey(),
      productId: it.product_id,
      variantId: it.variant_id ?? null,
      name: it.variant_title ? `${it.product_name} — ${it.variant_title}` : it.product_name,
      unitPrice: it.unit_price,
      quantity: it.quantity,
    }))
    discount.value = order.discount ?? 0
    shippingMethodId.value = order.shipping_method_id ?? null
    formError.value = ''
  },
  { immediate: true, deep: false },
)

// --- shipping method options -------------------------------------------------
const { data: methodsData } = useShippingMethodsQuery(() => ({ pageSize: 100 }))
const methodOptions = computed(() =>
  (methodsData.value?.items ?? []).map(m => ({ label: m.name, value: m.id })),
)

// --- product picker ----------------------------------------------------------
const searchTerm = ref('')
const debouncedTerm = ref('')
const setDebounced = useDebounceFn((v: string) => {
  debouncedTerm.value = v
}, 300)
watch(searchTerm, v => setDebounced(v))

const searchEnabled = computed(() => debouncedTerm.value.trim().length > 0)
const { data: searchResults, isLoading: searching } = useProductsQuery(() => ({
  search: debouncedTerm.value.trim() || undefined,
  pageSize: 8,
  page: 1,
}))
const candidates = computed<ProductWithCategory[]>(() =>
  searchEnabled.value ? (searchResults.value?.items ?? []) : [],
)

const picked = ref<ProductWithCategory | null>(null)
const pickedVariantId = ref<number | null>(null)

const { data: pickedVariants, isLoading: variantsLoading } = useProductVariantsQuery(
  () => picked.value?.id,
)
const activeVariants = computed(() =>
  (picked.value ? (pickedVariants.value ?? []) : []).filter(v => v.is_active),
)
const variantOptions = computed(() =>
  activeVariants.value.map(v => ({ label: v.sku ? `${v.title} (${v.sku})` : v.title, value: v.id })),
)
const needsVariant = computed(() => activeVariants.value.length > 0)

function pick(product: ProductWithCategory) {
  picked.value = product
  pickedVariantId.value = null
  searchTerm.value = ''
  debouncedTerm.value = ''
}
function clearPick() {
  picked.value = null
  pickedVariantId.value = null
}

const canAddPicked = computed(() =>
  picked.value !== null
  && !variantsLoading.value
  && (!needsVariant.value || pickedVariantId.value !== null),
)

function addPicked() {
  if (!picked.value || !canAddPicked.value) return
  const variant = activeVariants.value.find(v => v.id === pickedVariantId.value) ?? null
  const priced = selectPrice(variant ?? picked.value, currency.value)
  const line: EditLine = {
    key: nextKey(),
    productId: picked.value.id,
    variantId: variant?.id ?? null,
    name: variant ? `${picked.value.name} — ${variant.title}` : picked.value.name,
    unitPrice: priced?.amount ?? 0,
    quantity: 1,
  }
  lines.value = [...lines.value, line]
  clearPick()
}

function removeLine(key: string) {
  lines.value = lines.value.filter(l => l.key !== key)
}

// --- live preview ------------------------------------------------------------
const subtotal = computed(() =>
  lines.value.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
)
const totalPreview = computed(() =>
  Math.max(subtotal.value - (discount.value || 0) + (props.order.shipping ?? 0), 0),
)
function money(amount: number) {
  return formatMoney(amount, currency.value, locale.value)
}

// --- save --------------------------------------------------------------------
const canSave = computed(() => lines.value.length > 0 && !editMutation.isLoading.value)

async function onSave() {
  if (!canSave.value) return
  formError.value = ''
  const edit: OrderEditRequest = {
    lines: lines.value.map(l => ({
      product_id: l.productId,
      variant_id: l.variantId,
      quantity: l.quantity,
      unit_price_override: l.unitPrice,
    })),
    discount: discount.value || 0,
    shipping_method_id: shippingMethodId.value,
  }
  try {
    await editMutation.mutateAsync({ orderId: props.order.id, edit })
    toast.add({
      title: t('admin.orders.edit.saved'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    emit('saved')
  }
  catch (err) {
    const problem = parseProblem(err)
    // 409 = the order left the pending state under us (paid elsewhere). Match
    // on the status or the backend's machine phrase ("not editable").
    const notEditable
      = problem?.status === 409 || (problem?.detail ?? '').toLowerCase().includes('not editable')
    formError.value = notEditable
      ? t('admin.orders.edit.errors.notEditable')
      : (problem?.detail ?? t('messages.saveError'))
  }
}
</script>

<template>
  <UCard data-testid="order-items-editor">
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">
          {{ $t('admin.orders.edit.title') }}
        </h2>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          @click="emit('cancel')"
        >
          {{ $t('admin.orders.edit.cancel') }}
        </UButton>
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="formError"
        role="alert"
        color="error"
        variant="soft"
        :title="t('messages.saveErrorTitle')"
        :description="formError"
        :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
        @close="formError = ''"
      />

      <!-- Product picker -->
      <div class="space-y-2 rounded-md border border-default bg-elevated px-3 py-3">
        <template v-if="!picked">
          <UInput
            v-model="searchTerm"
            icon="i-lucide-search"
            :placeholder="$t('admin.orders.edit.searchPlaceholder')"
            class="w-full"
            data-testid="order-edit-search"
          />
          <div
            v-if="searchEnabled"
            class="border border-default rounded-md divide-y divide-default max-h-56 overflow-y-auto"
          >
            <div
              v-if="searching"
              class="text-muted text-sm py-3 text-center"
            >
              {{ $t('admin.orders.edit.searching') }}
            </div>
            <p
              v-else-if="candidates.length === 0"
              class="text-muted text-sm py-3 px-3"
            >
              {{ $t('admin.orders.edit.noResults') }}
            </p>
            <button
              v-for="product in candidates"
              v-else
              :key="product.id"
              type="button"
              class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-elevated"
              :data-testid="`order-edit-product-${product.id}`"
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
            <span class="font-medium text-sm truncate">{{ picked.name }}</span>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              :aria-label="$t('admin.orders.edit.clearPick')"
              @click="clearPick"
            />
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <UFormField
              v-if="variantsLoading || needsVariant"
              :label="$t('admin.orders.edit.variant')"
            >
              <USelect
                v-model.nullable="pickedVariantId"
                :items="variantOptions"
                value-key="value"
                :loading="variantsLoading"
                :placeholder="$t('admin.orders.edit.variantPlaceholder')"
                class="w-56"
                data-testid="order-edit-variant"
              />
            </UFormField>
            <UButton
              color="primary"
              icon="i-lucide-plus"
              :disabled="!canAddPicked"
              data-testid="order-edit-add"
              @click="addPicked"
            >
              {{ $t('admin.orders.edit.addLine') }}
            </UButton>
          </div>
        </template>
      </div>

      <!-- Editable lines -->
      <p
        v-if="lines.length === 0"
        class="text-sm text-muted"
      >
        {{ $t('admin.orders.edit.noLines') }}
      </p>
      <div
        v-else
        class="divide-y divide-default"
      >
        <div
          v-for="line in lines"
          :key="line.key"
          class="py-3 flex flex-wrap items-center gap-3"
          :data-testid="`order-edit-line-${line.productId}`"
        >
          <span class="font-medium text-sm min-w-0 flex-1 truncate">{{ line.name }}</span>
          <UFormField :label="$t('admin.orders.edit.quantity')">
            <UInputNumber
              v-model="line.quantity"
              :min="1"
              :step="1"
              size="sm"
              class="w-24"
              :aria-label="$t('admin.orders.edit.quantity')"
              :data-testid="`order-edit-qty-${line.productId}`"
            />
          </UFormField>
          <UFormField :label="$t('admin.orders.edit.unitPrice')">
            <UInputNumber
              v-model="line.unitPrice"
              :min="0"
              :step="0.01"
              size="sm"
              class="w-28"
              :aria-label="$t('admin.orders.edit.unitPrice')"
              :data-testid="`order-edit-price-${line.productId}`"
            />
          </UFormField>
          <span class="font-mono text-sm w-24 text-right">{{ money(line.unitPrice * line.quantity) }}</span>
          <UButton
            size="sm"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :aria-label="$t('admin.orders.edit.remove')"
            :data-testid="`order-edit-remove-${line.productId}`"
            @click="removeLine(line.key)"
          />
        </div>
      </div>

      <!-- Discount + shipping -->
      <div class="flex flex-wrap gap-4">
        <UFormField :label="$t('admin.orders.edit.discount')">
          <UInputNumber
            v-model="discount"
            :min="0"
            :step="0.01"
            class="w-32"
            data-testid="order-edit-discount"
          />
        </UFormField>
        <UFormField :label="$t('admin.orders.edit.shippingMethod')">
          <USelect
            v-model.nullable="shippingMethodId"
            :items="methodOptions"
            value-key="value"
            class="w-56"
            data-testid="order-edit-shipping"
          />
        </UFormField>
      </div>

      <!-- Preview totals -->
      <dl class="space-y-1 text-sm ml-auto w-full max-w-xs border-t border-default pt-2">
        <div class="flex justify-between">
          <dt class="text-muted">
            {{ $t('admin.orders.edit.subtotal') }}
          </dt>
          <dd
            class="font-mono"
            data-testid="order-edit-subtotal"
          >
            {{ money(subtotal) }}
          </dd>
        </div>
        <div
          v-if="(discount || 0) > 0"
          class="flex justify-between"
        >
          <dt class="text-muted">
            {{ $t('admin.orders.edit.discount') }}
          </dt>
          <dd class="font-mono">
            −{{ money(discount || 0) }}
          </dd>
        </div>
        <div class="flex justify-between font-semibold border-t border-default pt-1">
          <dt>{{ $t('admin.orders.edit.totalPreview') }}</dt>
          <dd
            class="font-mono"
            data-testid="order-edit-total"
          >
            {{ money(totalPreview) }}
          </dd>
        </div>
        <p class="text-xs text-muted">
          {{ $t('admin.orders.edit.previewHint') }}
        </p>
      </dl>

      <div class="flex justify-end gap-2">
        <UButton
          color="primary"
          icon="i-lucide-save"
          :loading="editMutation.isLoading.value"
          :disabled="!canSave"
          data-testid="order-edit-save"
          @click="onSave"
        >
          {{ $t('admin.orders.edit.save') }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>
