<script setup lang="ts">
/**
 * Create/edit a shipping method (admin).
 *
 * Method is carrier-agnostic: name + optional code (recommended for carrier
 * integrations later) + sort_order + is_active + description. Duplicate
 * name/code 400s on the wire; the inline `<ErrorAlert>` surfaces it.
 */

import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { ShippingMethodResponse } from '#shared/types/api'

const props = defineProps<{
  open: boolean
  method?: ShippingMethodResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()
const create = useCreateShippingMethod()
const update = useUpdateShippingMethod()

const mode = computed<'create' | 'edit'>(() => (props.method ? 'edit' : 'create'))
const loading = computed(() => create.isLoading.value || update.isLoading.value)

const state = reactive({
  name: '',
  code: '',
  description: '',
  sort_order: 0,
  is_active: true,
})
const error = ref<ProblemDetails | null>(null)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    if (props.method) {
      state.name = props.method.name
      state.code = props.method.code ?? ''
      state.description = props.method.description ?? ''
      state.sort_order = props.method.sort_order
      state.is_active = props.method.is_active
    }
    else {
      state.name = ''
      state.code = ''
      state.description = ''
      state.sort_order = 0
      state.is_active = true
    }
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  error.value = null
  // Empty strings → null so the backend sees an explicit absence.
  const payload = {
    name: state.name,
    code: state.code.trim() || null,
    description: state.description.trim() || null,
    sort_order: state.sort_order,
    is_active: state.is_active,
  }
  try {
    if (props.method) {
      await update.mutateAsync({ id: props.method.id, patch: payload })
      toast.add({ title: t('admin.shipping.flashes.methodUpdated') })
    }
    else {
      await create.mutateAsync(payload)
      toast.add({ title: t('admin.shipping.flashes.methodCreated') })
    }
    emit('saved')
    emit('update:open', false)
  }
  catch (err) {
    error.value = parseProblem(err)
  }
}
</script>

<template>
  <UModal v-model:open="openModel">
    <template #content>
      <UCard>
        <template #header>
          <h2 class="text-base font-semibold">
            {{ mode === 'edit' ? t('admin.shipping.methods.edit') : t('admin.shipping.methods.create') }}
          </h2>
        </template>

        <form
          class="space-y-4"
          @submit.prevent="onSubmit"
        >
          <ErrorAlert
            v-if="error"
            :problem="error"
          />

          <UFormField
            :label="t('admin.shipping.methods.name')"
            required
          >
            <UInput
              v-model="state.name"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.shipping.methods.code')"
            :hint="t('admin.shipping.methods.codeHint')"
          >
            <UInput
              v-model="state.code"
              :placeholder="t('admin.shipping.methods.codePlaceholder')"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('admin.shipping.methods.description')">
            <UTextarea
              v-model="state.description"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('admin.shipping.methods.sortOrder')">
              <UInputNumber
                v-model="state.sort_order"
                :min="0"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.shipping.methods.active')">
              <UCheckbox
                v-model="state.is_active"
                :label="t('admin.shipping.methods.fields.activeOn')"
              />
            </UFormField>
          </div>
        </form>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              :disabled="loading"
              @click="emit('update:open', false)"
            >
              {{ t('actions.cancel') }}
            </UButton>
            <UButton
              color="primary"
              :loading="loading"
              :disabled="state.name.trim().length === 0"
              @click="onSubmit"
            >
              {{ t('actions.save') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
