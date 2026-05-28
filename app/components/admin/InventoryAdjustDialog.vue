<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

const props = defineProps<{
  open: boolean
  productId: number | null
  productName: string
  currentStock: number
  currentThreshold: number | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const adjustStock = useAdjustStock()
const setThreshold = useSetLowStockThreshold()

// Per-warehouse levels for this product + the list of warehouses to pick from.
const { data: levels } = useProductLevels(() => props.productId)
const { data: warehousePage } = useWarehousesQuery(() => ({ isActive: true, pageSize: 100 }))

const warehouseOptions = computed(() =>
  (warehousePage.value?.items ?? []).map(w => ({
    label: `${w.code} — ${w.name}`,
    value: w.id,
  })),
)
const defaultWarehouseId = computed(
  () => (warehousePage.value?.items ?? []).find(w => w.is_default)?.id ?? null,
)

const selectedWarehouseId = ref<number | null>(null)
const newStock = ref<number>(0)
const threshold = ref<number | null>(props.currentThreshold)
const note = ref('')
const error = ref<ProblemDetails | null>(null)

const loading = computed(() => adjustStock.isLoading.value || setThreshold.isLoading.value)

// Current level of the selected warehouse (0 when no level row exists yet).
const currentLevel = computed(
  () =>
    (levels.value ?? []).find(l => l.warehouse_id === selectedWarehouseId.value)?.quantity ?? 0,
)

// Reset on open; default to the default warehouse once the list is available.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    threshold.value = props.currentThreshold
    note.value = ''
    error.value = null
    selectedWarehouseId.value = defaultWarehouseId.value
  },
  { immediate: true },
)
// The warehouses may load after the dialog opens — pick the default then.
watch(defaultWarehouseId, (id) => {
  if (props.open && selectedWarehouseId.value === null) selectedWarehouseId.value = id
})
// Reflect the selected warehouse's current level into the input. Immediate so the
// initial value matches currentLevel right after the open-watch picks a warehouse
// (otherwise newStock would stay 0 and look "changed").
watch([selectedWarehouseId, levels], () => {
  newStock.value = currentLevel.value
}, { immediate: true })

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  if (props.productId === null || selectedWarehouseId.value === null) return
  error.value = null

  const stockChanged = newStock.value !== currentLevel.value
  const thresholdChanged = (threshold.value ?? null) !== (props.currentThreshold ?? null)
  if (!stockChanged && !thresholdChanged) {
    openModel.value = false
    return
  }

  try {
    // Threshold first (a plain product update), then the warehouse stock movement.
    if (thresholdChanged) {
      await setThreshold.mutateAsync({
        productId: props.productId,
        threshold: threshold.value ?? null,
      })
    }
    if (stockChanged) {
      await adjustStock.mutateAsync({
        productId: props.productId,
        warehouseId: selectedWarehouseId.value,
        newStock: newStock.value,
        note: note.value || undefined,
      })
    }
    toast.add({
      title: t('admin.inventory.adjust.flashes.saved'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    emit('saved')
    openModel.value = false
  }
  catch (err) {
    error.value = parseProblem(err)
  }
}
</script>

<template>
  <AdminFormModal
    :open="openModel"
    :title="t('admin.inventory.adjust.title', { name: productName })"
    :description="t('admin.inventory.adjust.description')"
    :submit-label="t('admin.inventory.adjust.save')"
    :cancel-label="t('admin.inventory.adjust.cancel')"
    :loading="loading"
    :error="error"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Per-warehouse breakdown for context. -->
        <div
          v-if="(levels ?? []).length > 0"
          class="rounded-md bg-elevated/50 p-3 text-sm space-y-1"
        >
          <div class="text-muted font-medium">
            {{ $t('admin.inventory.adjust.levels') }}
          </div>
          <div
            v-for="lvl in levels"
            :key="lvl.warehouse_id"
            class="flex justify-between"
          >
            <span>{{ lvl.warehouse_code }}</span>
            <span class="font-semibold tabular-nums">{{ lvl.quantity }}</span>
          </div>
        </div>

        <UFormField
          :label="$t('admin.inventory.adjust.warehouse')"
          name="warehouse_id"
        >
          <USelect
            v-model="selectedWarehouseId"
            :items="warehouseOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <div class="text-sm text-muted">
          {{ $t('admin.inventory.adjust.currentStock') }}:
          <span class="font-semibold text-default">{{ currentLevel }}</span>
        </div>

        <UFormField
          :label="$t('admin.inventory.adjust.newStock')"
          name="new_stock"
        >
          <UInputNumber
            v-model="newStock"
            :min="0"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="$t('admin.inventory.adjust.threshold')"
          :help="$t('admin.inventory.adjust.thresholdHint')"
          name="low_stock_threshold"
        >
          <UInputNumber
            v-model="threshold"
            :min="0"
            :placeholder="$t('admin.inventory.adjust.thresholdPlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="$t('admin.inventory.adjust.note')"
          name="note"
        >
          <UInput
            v-model="note"
            :placeholder="$t('admin.inventory.adjust.notePlaceholder')"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
