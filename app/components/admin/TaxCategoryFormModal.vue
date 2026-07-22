<script setup lang="ts">
import { z } from 'zod'
import type {
  TaxCategoryCreate,
  TaxCategoryResponse,
  TaxCategoryUpdate,
} from '#shared/types/api'

/**
 * Create / edit a tax category.
 *
 * `category === null` ⇒ create (POST); a category ⇒ edit (PATCH). `code` is the
 * stable identifier — editable on create, immutable on edit (the backend
 * `TaxCategoryUpdate` doesn't accept it). Setting `is_default` demotes the
 * previous default server-side.
 */

const props = defineProps<{
  open: boolean
  category: TaxCategoryResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [category: TaxCategoryResponse]
}>()

const { t } = useI18n()
const toast = useToast()

const createCategory = useCreateTaxCategory()
const updateCategory = useUpdateTaxCategory()

const state = reactive({
  code: '',
  name: '',
  name_pl: '',
  is_default: false,
})
const error = ref<unknown>(null)

const isEdit = computed(() => props.category !== null)
const loading = computed(() => createCategory.isLoading.value || updateCategory.isLoading.value)

const schema = computed(() =>
  z.object({
    code: z.string().trim().min(1, t('admin.tax.errors.codeRequired')).max(32),
    name: z.string().trim().min(1, t('admin.tax.errors.nameRequired')).max(100),
    name_pl: z.string(),
    is_default: z.boolean(),
  }),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const c = props.category
    state.code = c?.code ?? ''
    state.name = c?.name ?? ''
    state.name_pl = c?.name_pl ?? ''
    state.is_default = c?.is_default ?? false
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  error.value = null
  try {
    let saved: TaxCategoryResponse
    const name_pl = state.name_pl.trim() || null
    if (props.category) {
      const patch: TaxCategoryUpdate = { name: state.name.trim(), name_pl, is_default: state.is_default }
      saved = await updateCategory.mutateAsync({ id: props.category.id, patch })
      toast.add({ title: t('admin.tax.flashes.categoryUpdated'), color: 'success', icon: 'i-lucide-check' })
    }
    else {
      const body: TaxCategoryCreate = {
        code: state.code.trim(),
        name: state.name.trim(),
        name_pl,
        is_default: state.is_default,
      }
      saved = await createCategory.mutateAsync(body)
      toast.add({ title: t('admin.tax.flashes.categoryCreated'), color: 'success', icon: 'i-lucide-check' })
    }
    emit('saved', saved)
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
    :title="isEdit ? t('admin.tax.category.editTitle') : t('admin.tax.category.createTitle')"
    :submit-label="t('admin.tax.form.save')"
    :cancel-label="t('admin.tax.form.cancel')"
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
          :label="t('admin.tax.category.fields.code')"
          :help="isEdit ? t('admin.tax.category.codeImmutable') : t('admin.tax.category.codeHint')"
          name="code"
          required
        >
          <UInput
            v-model="state.code"
            class="w-full"
            :disabled="isEdit"
            data-testid="tax-category-code"
          />
        </UFormField>

        <UFormField
          :label="t('admin.tax.category.fields.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
            data-testid="tax-category-name"
          />
        </UFormField>

        <UFormField
          :label="t('admin.tax.category.fields.namePl')"
          name="name_pl"
        >
          <UInput
            v-model="state.name_pl"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.tax.category.fields.isDefault')"
          :help="t('admin.tax.category.isDefaultHint')"
          name="is_default"
        >
          <USwitch v-model="state.is_default" />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
