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
const transfer = useTransferStock()
const { data: warehousePage } = useWarehousesQuery(() => ({ isActive: true, pageSize: 100 }))
const { data: levels } = useProductLevels(() => props.productId)

const warehouseOptions = computed(() =>
  (warehousePage.value?.items ?? []).map(w => ({ label: `${w.code} — ${w.name}`, value: w.id })),
)
const defaultWarehouseId = computed(
  () => (warehousePage.value?.items ?? []).find(w => w.is_default)?.id ?? null,
)

const state = reactive({
  from_warehouse_id: null as number | null,
  to_warehouse_id: null as number | null,
  quantity: 1,
  note: '',
})
const error = ref<unknown>(null)

const sourceLevel = computed(
  () => (levels.value ?? []).find(l => l.warehouse_id === state.from_warehouse_id)?.quantity ?? 0,
)

// Client-side guards mirror the backend (which 422s these) for a faster signal.
const schema = computed(() =>
  z.object({
    from_warehouse_id: z.number({ message: t('messages.fieldRequired') }),
    to_warehouse_id: z.number({ message: t('messages.fieldRequired') }),
    quantity: z.number().min(1),
    note: z.string(),
  }).superRefine((val, ctx) => {
    if (val.from_warehouse_id === val.to_warehouse_id) {
      ctx.addIssue({
        code: 'custom',
        message: t('admin.inventory.transfer.sameWarehouse'),
        path: ['to_warehouse_id'],
      })
    }
    if (val.quantity > sourceLevel.value) {
      ctx.addIssue({
        code: 'custom',
        message: t('admin.inventory.transfer.insufficient', { available: sourceLevel.value }),
        path: ['quantity'],
      })
    }
  }),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    state.quantity = 1
    state.note = ''
    state.from_warehouse_id = defaultWarehouseId.value
    state.to_warehouse_id = null
  },
  { immediate: true },
)
watch(defaultWarehouseId, (id) => {
  if (props.open && state.from_warehouse_id === null) state.from_warehouse_id = id
})

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  if (
    props.productId === null
    || state.from_warehouse_id === null
    || state.to_warehouse_id === null
  ) {
    return
  }
  error.value = null
  try {
    await transfer.mutateAsync({
      productId: props.productId,
      fromWarehouseId: state.from_warehouse_id,
      toWarehouseId: state.to_warehouse_id,
      quantity: state.quantity,
      note: state.note || undefined,
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
    error.value = err
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
    :schema="schema"
    :state="state"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.inventory.transfer.from')"
          name="from_warehouse_id"
          required
        >
          <USelect
            v-model="state.from_warehouse_id"
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
          required
        >
          <USelect
            v-model="state.to_warehouse_id"
            :items="warehouseOptions"
            value-key="value"
            :placeholder="t('admin.inventory.transfer.toPlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.inventory.transfer.quantity')"
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
          :label="t('admin.inventory.transfer.note')"
          name="note"
        >
          <UInput
            v-model="state.note"
            :placeholder="t('admin.inventory.transfer.notePlaceholder')"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
