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
const restock = useRestock()
const { data: warehousePage } = useWarehousesQuery(() => ({ isActive: true, pageSize: 100 }))

const warehouseOptions = computed(() =>
  (warehousePage.value?.items ?? []).map(w => ({ label: `${w.code} — ${w.name}`, value: w.id })),
)
const defaultWarehouseId = computed(
  () => (warehousePage.value?.items ?? []).find(w => w.is_default)?.id ?? null,
)

const warehouseId = ref<number | null>(null)
const quantity = ref<number>(1)
const note = ref('')
const error = ref<ProblemDetails | null>(null)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    quantity.value = 1
    note.value = ''
    warehouseId.value = defaultWarehouseId.value
  },
  { immediate: true },
)
watch(defaultWarehouseId, (id) => {
  if (props.open && warehouseId.value === null) warehouseId.value = id
})

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  if (props.productId === null || warehouseId.value === null) return
  error.value = null
  try {
    await restock.mutateAsync({
      productId: props.productId,
      warehouseId: warehouseId.value,
      quantity: quantity.value,
      note: note.value || undefined,
    })
    toast.add({
      title: t('admin.inventory.restock.flashes.saved'),
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
    :title="t('admin.inventory.restock.title', { name: productName })"
    :description="t('admin.inventory.restock.description')"
    :submit-label="t('admin.inventory.restock.save')"
    :cancel-label="t('admin.inventory.restock.cancel')"
    :loading="restock.isLoading.value"
    :error="error"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.inventory.restock.warehouse')"
          name="warehouse_id"
        >
          <USelect
            v-model="warehouseId"
            :items="warehouseOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.inventory.restock.quantity')"
          name="quantity"
        >
          <UInputNumber
            v-model="quantity"
            :min="1"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.inventory.restock.note')"
          name="note"
        >
          <UInput
            v-model="note"
            :placeholder="t('admin.inventory.restock.notePlaceholder')"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
