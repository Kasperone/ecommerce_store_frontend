<script setup lang="ts">
import slugify from 'slugify'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { CategoryResponse, CategoryWithProductCount } from '#shared/types/api'
import {
  createCategoryCreateSchema,
  createCategoryUpdateSchema,
} from '#shared/validators/category'

const props = defineProps<{
  open: boolean
  /** Pass an existing category to edit; omit for create mode. */
  category?: CategoryResponse | CategoryWithProductCount | null
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [value: { name: string, slug: string, description?: string | null, is_active: boolean }]
  'cancel': []
}>()

const { t } = useI18n()
const mode = computed<'create' | 'edit'>(() => (props.category ? 'edit' : 'create'))

const state = reactive({
  name: '',
  slug: '',
  description: '' as string | null,
  is_active: true,
})

// Track whether the user has hand-edited the slug. If they have, we stop
// auto-syncing it from the name — otherwise auto-slugify on name blur.
const slugManuallyEdited = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    if (props.category) {
      state.name = props.category.name
      state.slug = props.category.slug
      state.description = props.category.description ?? ''
      state.is_active = props.category.is_active
      slugManuallyEdited.value = true // editing an existing slug should not be overwritten
    }
    else {
      state.name = ''
      state.slug = ''
      state.description = ''
      state.is_active = true
      slugManuallyEdited.value = false
    }
  },
  { immediate: true },
)

function onNameBlur() {
  if (!slugManuallyEdited.value && state.name) {
    state.slug = slugify(state.name, { lower: true, strict: true })
  }
}

function onSlugInput() {
  slugManuallyEdited.value = state.slug.length > 0
}

const schema = computed(() => (mode.value === 'create' ? createCategoryCreateSchema(t) : createCategoryUpdateSchema(t)))

async function validate(values: typeof state): Promise<FormError[]> {
  const result = schema.value.safeParse(values)
  if (result.success) return []
  return result.error.issues.map(issue => ({
    name: String(issue.path[0] ?? ''),
    message: issue.message,
  }))
}

function onSubmit(event: FormSubmitEvent<typeof state>) {
  emit('submit', {
    name: event.data.name,
    slug: event.data.slug,
    description: event.data.description || null,
    is_active: event.data.is_active,
  })
}

const title = computed(() =>
  mode.value === 'create'
    ? t('admin.categories.actions.create', { default: 'New category' })
    : t('admin.categories.actions.edit', { default: 'Edit category' }),
)
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :dismissible="!loading"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <ErrorAlert
        v-if="error"
        :problem="error"
        class="mb-4"
      />
      <UForm
        :state="state"
        :validate="validate"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          :label="t('admin.categories.fields.name', { default: 'Name' })"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            :placeholder="t('admin.categories.placeholders.name', { default: 'Books' })"
            :disabled="loading"
            class="w-full"
            @blur="onNameBlur"
          />
        </UFormField>

        <UFormField
          :label="t('admin.categories.fields.slug', { default: 'Slug' })"
          name="slug"
          required
          :hint="t('admin.categories.fields.slugHint', {
            default: 'Lowercase letters, numbers, and hyphens',
          })"
        >
          <UInput
            v-model="state.slug"
            :placeholder="t('admin.categories.placeholders.slug', { default: 'books' })"
            :disabled="loading"
            class="w-full"
            @input="onSlugInput"
          />
        </UFormField>

        <UFormField
          :label="t('admin.categories.fields.description', { default: 'Description' })"
          name="description"
        >
          <UTextarea
            v-model="state.description"
            :placeholder="t('admin.categories.placeholders.description', {
              default: 'Optional summary',
            })"
            :disabled="loading"
            class="w-full"
            :rows="3"
          />
        </UFormField>

        <UFormField name="is_active">
          <UCheckbox
            v-model="state.is_active"
            :label="t('admin.categories.fields.isActive', { default: 'Active' })"
            :disabled="loading"
          />
        </UFormField>

        <!-- Hidden submit so pressing Enter inside any input fires the form. -->
        <button
          type="submit"
          class="hidden"
          :disabled="loading"
        />
      </UForm>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="loading"
          @click="emit('cancel'); emit('update:open', false)"
        >
          {{ t('admin.categories.actions.cancel', { default: 'Cancel' }) }}
        </UButton>
        <UButton
          color="primary"
          :loading="loading"
          @click="onSubmit({ data: { ...state } } as FormSubmitEvent<typeof state>)"
        >
          {{ t('admin.categories.actions.save', { default: 'Save' }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
