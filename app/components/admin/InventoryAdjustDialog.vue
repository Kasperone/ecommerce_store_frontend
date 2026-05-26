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

const newStock = ref<number>(props.currentStock)
const threshold = ref<number | null>(props.currentThreshold)
const note = ref('')
const error = ref<ProblemDetails | null>(null)

const loading = computed(() => adjustStock.isLoading.value || setThreshold.isLoading.value)

// Reset the form each time the dialog opens for a (possibly different) product.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      newStock.value = props.currentStock
      threshold.value = props.currentThreshold
      note.value = ''
      error.value = null
    }
  },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  if (props.productId === null) return
  error.value = null

  const stockChanged = newStock.value !== props.currentStock
  const thresholdChanged = (threshold.value ?? null) !== (props.currentThreshold ?? null)
  if (!stockChanged && !thresholdChanged) {
    openModel.value = false
    return
  }

  try {
    // Threshold first (a plain product update), then the stock movement, so a
    // failure on either surfaces before the other half runs.
    if (thresholdChanged) {
      await setThreshold.mutateAsync({
        productId: props.productId,
        threshold: threshold.value ?? null,
      })
    }
    if (stockChanged) {
      await adjustStock.mutateAsync({
        productId: props.productId,
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
        <div class="text-sm text-muted">
          {{ $t('admin.inventory.adjust.currentStock') }}:
          <span class="font-semibold text-default">{{ currentStock }}</span>
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
