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
import { z } from 'zod'
import type { ShippingMethodResponse } from '#shared/types/api'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

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

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('messages.fieldRequired')),
    code: z.string(),
    description: z.string(),
    sort_order: z.number(),
    is_active: z.boolean(),
  }),
)

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const hiddenSubmitRef = ref<HTMLButtonElement | null>(null)
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    errorMessage.value = ''
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
  errorMessage.value = ''
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
    applyApiError(err, t('messages.saveError'))
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

        <UForm
          ref="formRef"
          :schema="schema"
          :state="state"
          :validate-on="['submit']"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UAlert
            v-if="errorMessage"
            role="alert"
            color="error"
            variant="soft"
            :title="t('messages.saveErrorTitle')"
            :description="errorMessage"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="errorMessage = ''"
          />

          <UFormField
            :label="t('admin.shipping.methods.name')"
            name="name"
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
            name="code"
          >
            <UInput
              v-model="state.code"
              :placeholder="t('admin.shipping.methods.codePlaceholder')"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.shipping.methods.description')"
            name="description"
          >
            <UTextarea
              v-model="state.description"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('admin.shipping.methods.sortOrder')"
              name="sort_order"
            >
              <UInputNumber
                v-model="state.sort_order"
                :min="0"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.shipping.methods.active')"
              name="is_active"
            >
              <UCheckbox
                v-model="state.is_active"
                :label="t('admin.shipping.methods.fields.activeOn')"
              />
            </UFormField>
          </div>

          <button
            ref="hiddenSubmitRef"
            type="submit"
            hidden
            aria-hidden="true"
            tabindex="-1"
            :disabled="loading"
          />
        </UForm>

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
              @click="hiddenSubmitRef?.click()"
            >
              {{ t('actions.save') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
