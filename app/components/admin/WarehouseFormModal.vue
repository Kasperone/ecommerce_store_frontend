<script setup lang="ts">
import type { WarehouseResponse } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

const props = defineProps<{
  open: boolean
  // null = create; a warehouse = edit.
  warehouse: WarehouseResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const createWarehouse = useCreateWarehouse()
const updateWarehouse = useUpdateWarehouse()

const name = ref('')
const code = ref('')
const isActive = ref(true)
const isDefault = ref(false)
const error = ref<ProblemDetails | null>(null)

const isEdit = computed(() => props.warehouse !== null)
const loading = computed(() => createWarehouse.isLoading.value || updateWarehouse.isLoading.value)
// The current default can't be un-set here (the backend 400s) — you promote
// another warehouse instead. Lock the switch on in that case.
const defaultLocked = computed(() => isEdit.value && props.warehouse?.is_default === true)
const defaultHelp = computed(() =>
  defaultLocked.value
    ? t('admin.warehouses.form.isDefaultLocked')
    : t('admin.warehouses.form.isDefaultHint'),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    name.value = props.warehouse?.name ?? ''
    code.value = props.warehouse?.code ?? ''
    isActive.value = props.warehouse?.is_active ?? true
    isDefault.value = props.warehouse?.is_default ?? false
  },
  // immediate so an already-open mount (and re-opens) prefill from the warehouse prop.
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  error.value = null
  const body = {
    name: name.value.trim(),
    code: code.value.trim(),
    is_active: isActive.value,
    is_default: isDefault.value,
  }
  try {
    if (props.warehouse) {
      await updateWarehouse.mutateAsync({ id: props.warehouse.id, patch: body })
      toast.add({
        title: t('admin.warehouses.flashes.updated'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    else {
      await createWarehouse.mutateAsync(body)
      toast.add({
        title: t('admin.warehouses.flashes.created'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
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
    :title="isEdit ? t('admin.warehouses.form.editTitle') : t('admin.warehouses.form.createTitle')"
    :submit-label="t('admin.warehouses.form.save')"
    :cancel-label="t('admin.warehouses.form.cancel')"
    :loading="loading"
    :error="error"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.warehouses.form.name')"
          name="name"
        >
          <UInput
            v-model="name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.warehouses.form.code')"
          :help="t('admin.warehouses.form.codeHint')"
          name="code"
        >
          <UInput
            v-model="code"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.warehouses.form.isActive')"
          name="is_active"
        >
          <USwitch v-model="isActive" />
        </UFormField>

        <UFormField
          :label="t('admin.warehouses.form.isDefault')"
          :help="defaultHelp"
          name="is_default"
        >
          <USwitch
            v-model="isDefault"
            :disabled="defaultLocked"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
