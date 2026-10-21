<script setup lang="ts">
import { z } from 'zod'

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

const state = reactive({
  warehouse_id: null as number | null,
  quantity: 1,
  note: '',
})
const error = ref<unknown>(null)

const schema = computed(() =>
  z.object({
    warehouse_id: z.number({ message: t('messages.fieldRequired') }),
    quantity: z.number().min(1),
    note: z.string(),
  }),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    state.quantity = 1
    state.note = ''
    state.warehouse_id = defaultWarehouseId.value
  },
  { immediate: true },
)
watch(defaultWarehouseId, (id) => {
  if (props.open && state.warehouse_id === null) state.warehouse_id = id
})

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  if (props.productId === null || state.warehouse_id === null) return
  error.value = null
  try {
    await restock.mutateAsync({
      productId: props.productId,
      warehouseId: state.warehouse_id,
      quantity: state.quantity,
      note: state.note || undefined,
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
    error.value = err
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
    :schema="schema"
    :state="state"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.inventory.restock.warehouse')"
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

        <UFormField
          :label="t('admin.inventory.restock.quantity')"
          name="quantity"
          required
        >
          <UInputNumber
            v-model="state.quantity"
            :min="1"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.inventory.restock.note')"
          name="note"
        >
          <UInput
            v-model="state.note"
            :placeholder="t('admin.inventory.restock.notePlaceholder')"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
