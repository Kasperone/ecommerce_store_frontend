<script setup lang="ts">
import { z } from 'zod'

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

const state = reactive({
  warehouse_id: null as number | null,
  new_stock: 0,
  threshold: props.currentThreshold as number | null,
  note: '',
})
const error = ref<unknown>(null)

const schema = computed(() =>
  z.object({
    warehouse_id: z.number({ message: t('messages.fieldRequired') }),
    new_stock: z.number().min(0),
    threshold: z.number().min(0).nullable(),
    note: z.string(),
  }),
)

const loading = computed(() => adjustStock.isLoading.value || setThreshold.isLoading.value)

// Current level of the selected warehouse (0 when no level row exists yet).
const currentLevel = computed(
  () =>
    (levels.value ?? []).find(l => l.warehouse_id === state.warehouse_id)?.quantity ?? 0,
)

// Reset on open; default to the default warehouse once the list is available.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    state.threshold = props.currentThreshold
    state.note = ''
    error.value = null
    state.warehouse_id = defaultWarehouseId.value
  },
  { immediate: true },
)
// The warehouses may load after the dialog opens — pick the default then.
watch(defaultWarehouseId, (id) => {
  if (props.open && state.warehouse_id === null) state.warehouse_id = id
})
// Reflect the selected warehouse's current level into the input. Immediate so the
// initial value matches currentLevel right after the open-watch picks a warehouse
// (otherwise new_stock would stay 0 and look "changed").
watch([() => state.warehouse_id, levels], () => {
  state.new_stock = currentLevel.value
}, { immediate: true })

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  if (props.productId === null || state.warehouse_id === null) return
  error.value = null

  const stockChanged = state.new_stock !== currentLevel.value
  const thresholdChanged = (state.threshold ?? null) !== (props.currentThreshold ?? null)
  if (!stockChanged && !thresholdChanged) {
    openModel.value = false
    return
  }

  try {
    // Threshold first (a plain product update), then the warehouse stock movement.
    if (thresholdChanged) {
      await setThreshold.mutateAsync({
        productId: props.productId,
        threshold: state.threshold ?? null,
      })
    }
    if (stockChanged) {
      await adjustStock.mutateAsync({
        productId: props.productId,
        warehouseId: state.warehouse_id,
        newStock: state.new_stock,
        note: state.note || undefined,
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
    error.value = err
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
    :schema="schema"
    :state="state"
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
          required
        >
          <USelect
            v-model.nullable="state.warehouse_id"
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
          required
        >
          <UInputNumber
            v-model="state.new_stock"
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
            v-model="state.threshold"
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
            v-model="state.note"
            :placeholder="$t('admin.inventory.adjust.notePlaceholder')"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
