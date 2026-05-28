<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

const props = defineProps<{
  open: boolean
  productId: number | null
  productName: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()
const transfer = useTransferStock()
const { data: warehousePage } = useWarehousesQuery(() => ({ isActive: true, pageSize: 100 }))
const { data: levels } = useProductLevels(() => props.productId)

const warehouseOptions = computed(() =>
  (warehousePage.value?.items ?? []).map(w => ({ label: `${w.code} — ${w.name}`, value: w.id })),
)
const defaultWarehouseId = computed(
  () => (warehousePage.value?.items ?? []).find(w => w.is_default)?.id ?? null,
)

const fromWarehouseId = ref<number | null>(null)
const toWarehouseId = ref<number | null>(null)
const quantity = ref<number>(1)
const note = ref('')
const error = ref<ProblemDetails | null>(null)

const sourceLevel = computed(
  () => (levels.value ?? []).find(l => l.warehouse_id === fromWarehouseId.value)?.quantity ?? 0,
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    quantity.value = 1
    note.value = ''
    fromWarehouseId.value = defaultWarehouseId.value
    toWarehouseId.value = null
  },
  { immediate: true },
)
watch(defaultWarehouseId, (id) => {
  if (props.open && fromWarehouseId.value === null) fromWarehouseId.value = id
})

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  if (props.productId === null || fromWarehouseId.value === null || toWarehouseId.value === null) {
    return
  }
  error.value = null
  // Client-side guards mirror the backend (which 422s these) for a faster signal.
  if (fromWarehouseId.value === toWarehouseId.value) {
    error.value = { title: t('admin.inventory.transfer.sameWarehouse') }
    return
  }
  if (quantity.value > sourceLevel.value) {
    error.value = {
      title: t('admin.inventory.transfer.insufficient', { available: sourceLevel.value }),
    }
    return
  }
  try {
    await transfer.mutateAsync({
      productId: props.productId,
      fromWarehouseId: fromWarehouseId.value,
      toWarehouseId: toWarehouseId.value,
      quantity: quantity.value,
      note: note.value || undefined,
    })
    toast.add({
      title: t('admin.inventory.transfer.flashes.saved'),
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
    :title="t('admin.inventory.transfer.title', { name: productName })"
    :description="t('admin.inventory.transfer.description')"
    :submit-label="t('admin.inventory.transfer.save')"
    :cancel-label="t('admin.inventory.transfer.cancel')"
    :loading="transfer.isLoading.value"
    :error="error"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.inventory.transfer.from')"
          name="from_warehouse_id"
        >
          <USelect
            v-model="fromWarehouseId"
            :items="warehouseOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <div class="text-sm text-muted">
          {{ t('admin.inventory.transfer.available') }}:
          <span class="font-semibold text-default">{{ sourceLevel }}</span>
        </div>

        <UFormField
          :label="t('admin.inventory.transfer.to')"
          name="to_warehouse_id"
        >
          <USelect
            v-model="toWarehouseId"
            :items="warehouseOptions"
            value-key="value"
            :placeholder="t('admin.inventory.transfer.toPlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.inventory.transfer.quantity')"
          name="quantity"
        >
          <UInputNumber
            v-model="quantity"
            :min="1"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.inventory.transfer.note')"
          name="note"
        >
          <UInput
            v-model="note"
            :placeholder="t('admin.inventory.transfer.notePlaceholder')"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
