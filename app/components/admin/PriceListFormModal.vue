<script setup lang="ts">
import { z } from 'zod'
import type {
  PriceListCreate,
  PriceListResponse,
  PriceListUpdate,
} from '~/composables/queries/usePriceListQueries'

/**
 * Create / edit a B2B price-list header (name / active / notes).
 *
 * `priceList === null` ⇒ create (POST); a list ⇒ edit (PATCH). Entries are
 * managed on the detail page, not here. On create success the parent navigates
 * to the new list's detail so entries can be added right away.
 */

const props = defineProps<{
  open: boolean
  priceList: PriceListResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [list: PriceListResponse]
}>()

const { t } = useI18n()
const toast = useToast()

const createPriceList = useCreatePriceList()
const updatePriceList = useUpdatePriceList()

const state = reactive({
  name: '',
  is_active: true,
  notes: '',
})
const error = ref<unknown>(null)

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('admin.priceLists.errors.nameRequired')),
    is_active: z.boolean(),
    notes: z.string(),
  }),
)

const isEdit = computed(() => props.priceList !== null)
const loading = computed(
  () => createPriceList.isLoading.value || updatePriceList.isLoading.value,
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const pl = props.priceList
    state.name = pl?.name ?? ''
    state.is_active = pl?.is_active ?? true
    state.notes = pl?.notes ?? ''
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  error.value = null
  const notes = state.notes.trim() || null
  try {
    let saved: PriceListResponse
    if (props.priceList) {
      const patch: PriceListUpdate = { name: state.name.trim(), is_active: state.is_active, notes }
      saved = await updatePriceList.mutateAsync({ id: props.priceList.id, patch })
      toast.add({
        title: t('admin.priceLists.flashes.updated'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    else {
      const body: PriceListCreate = { name: state.name.trim(), is_active: state.is_active, notes }
      saved = await createPriceList.mutateAsync(body)
      toast.add({
        title: t('admin.priceLists.flashes.created'),
        color: 'success',
        icon: 'i-lucide-check',
      })
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
    :title="isEdit ? t('admin.priceLists.form.editTitle') : t('admin.priceLists.form.createTitle')"
    :submit-label="t('admin.priceLists.form.save')"
    :cancel-label="t('admin.priceLists.form.cancel')"
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
          :label="t('admin.priceLists.form.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
            data-testid="price-list-name"
          />
        </UFormField>

        <UFormField
          :label="t('admin.priceLists.form.active')"
          :help="t('admin.priceLists.form.activeHint')"
          name="is_active"
        >
          <USwitch v-model="state.is_active" />
        </UFormField>

        <UFormField
          :label="t('admin.priceLists.form.notes')"
          name="notes"
        >
          <UTextarea
            v-model="state.notes"
            :rows="3"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
