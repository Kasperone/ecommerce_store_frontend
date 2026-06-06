<script setup lang="ts">
import { z } from 'zod'
import type { WarehouseResponse } from '#shared/types/api'

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

const state = reactive({
  name: '',
  code: '',
  is_active: true,
  is_default: false,
})
const error = ref<unknown>(null)

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('messages.fieldRequired')),
    code: z.string().trim().min(1, t('messages.fieldRequired')),
    is_active: z.boolean(),
    is_default: z.boolean(),
  }),
)

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
    state.name = props.warehouse?.name ?? ''
    state.code = props.warehouse?.code ?? ''
    state.is_active = props.warehouse?.is_active ?? true
    state.is_default = props.warehouse?.is_default ?? false
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
    name: state.name.trim(),
    code: state.code.trim(),
    is_active: state.is_active,
    is_default: state.is_default,
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
    error.value = err
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
    :schema="schema"
    :state="state"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.warehouses.form.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.warehouses.form.code')"
          :help="t('admin.warehouses.form.codeHint')"
          name="code"
          required
        >
          <UInput
            v-model="state.code"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.warehouses.form.isActive')"
          name="is_active"
        >
          <USwitch v-model="state.is_active" />
        </UFormField>

        <UFormField
          :label="t('admin.warehouses.form.isDefault')"
          :help="defaultHelp"
          name="is_default"
        >
          <USwitch
            v-model="state.is_default"
            :disabled="defaultLocked"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
