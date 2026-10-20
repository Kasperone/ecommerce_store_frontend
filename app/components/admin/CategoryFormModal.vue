<script setup lang="ts">
import slugify from 'slugify'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import type {
  CategoryResponse,
  CategoryTreeNode,
  CategoryWithProductCount,
} from '#shared/types/api'
import {
  createCategoryCreateSchema,
  createCategoryUpdateSchema,
} from '#shared/validators/category'

/**
 * Per-locale tabs + SEO meta + hero staging.
 *
 * Submit payload includes every populated field — the page handles the
 * multi-step orchestration (POST/PUT category, then POST hero on success
 * with a compensating DELETE on hero failure for newly-created categories,
 * mirroring the products one-step-create flow from PR #57).
 */

type LocaleTab = 'en' | 'pl'

export interface CategoryFormSubmit {
  name: string
  slug: string
  description: string | null
  is_active: boolean
  name_pl: string | null
  slug_pl: string | null
  description_pl: string | null
  meta_title: string | null
  meta_description: string | null
  meta_title_pl: string | null
  meta_description_pl: string | null
  google_product_category: string | null
  /** Local file the page should POST to /hero after the row lands. */
  heroFile: File | null
  /** Alt text for the hero (existing or staged); empty string means "none". */
  heroAlt: string
  /** True when the admin clicked Remove on an existing hero (edit mode). */
  removeExistingHero: boolean
}

const props = defineProps<{
  open: boolean
  category?: CategoryResponse | CategoryWithProductCount | CategoryTreeNode | null
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [value: CategoryFormSubmit]
  'cancel': []
}>()

const { t } = useI18n()
const toast = useToast()
const mode = computed<'create' | 'edit'>(() => (props.category ? 'edit' : 'create'))
const seoHint = computed(() =>
  t('admin.categories.seo.hint', {
    default: 'Optional. Used as the page title and meta description for the storefront category page.',
  }),
)

const state = reactive({
  name: '',
  slug: '',
  description: '' as string,
  is_active: true,
  name_pl: '' as string,
  slug_pl: '' as string,
  description_pl: '' as string,
  meta_title: '' as string,
  meta_description: '' as string,
  meta_title_pl: '' as string,
  meta_description_pl: '' as string,
  google_product_category: '' as string,
})

const slugEnManuallyEdited = ref(false)
const slugPlManuallyEdited = ref(false)
const heroFile = ref<File | null>(null)
const heroAlt = ref('')
const removeExistingHero = ref(false)
const localeTab = ref<LocaleTab>('en')

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

// The page owns the create/update fetch; surface its raw error here so the
// modal drives the same flow as signin (message + backend field mapping).
watch(
  () => props.error,
  (err) => {
    if (err) applyApiError(err, t('messages.saveError'))
    else errorMessage.value = ''
  },
)

const existingHero = computed(() =>
  removeExistingHero.value
    ? null
    : (props.category as CategoryResponse | undefined)?.hero_image_url ?? null,
)
const existingHeroAlt = computed(() =>
  (props.category as CategoryResponse | undefined)?.hero_image_alt ?? null,
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    localeTab.value = 'en'
    heroFile.value = null
    heroAlt.value = existingHeroAlt.value ?? ''
    removeExistingHero.value = false
    if (props.category) {
      const c = props.category as CategoryResponse & Partial<CategoryTreeNode>
      state.name = c.name
      state.slug = c.slug
      state.description = c.description ?? ''
      state.is_active = c.is_active
      state.name_pl = c.name_pl ?? ''
      state.slug_pl = c.slug_pl ?? ''
      state.description_pl = c.description_pl ?? ''
      state.meta_title = c.meta_title ?? ''
      state.meta_description = c.meta_description ?? ''
      state.meta_title_pl = c.meta_title_pl ?? ''
      state.meta_description_pl = c.meta_description_pl ?? ''
      state.google_product_category = c.google_product_category ?? ''
      // Existing slugs are user intent; do not silently overwrite.
      slugEnManuallyEdited.value = true
      slugPlManuallyEdited.value = state.slug_pl.length > 0
    }
    else {
      state.name = ''
      state.slug = ''
      state.description = ''
      state.is_active = true
      state.name_pl = ''
      state.slug_pl = ''
      state.description_pl = ''
      state.meta_title = ''
      state.meta_description = ''
      state.meta_title_pl = ''
      state.meta_description_pl = ''
      state.google_product_category = ''
      slugEnManuallyEdited.value = false
      slugPlManuallyEdited.value = false
    }
  },
  { immediate: true },
)

function onNameBlur() {
  if (!slugEnManuallyEdited.value && state.name) {
    state.slug = slugify(state.name, { lower: true, strict: true })
  }
}

function onSlugInput(value: string | number) {
  // Read the emitted value directly — in happy-dom @input fires before
  // v-model's @update:model-value lands on state. Same pattern as ProductForm.
  slugEnManuallyEdited.value = String(value ?? '').length > 0
}

function onNamePlBlur() {
  if (!slugPlManuallyEdited.value && state.name_pl) {
    state.slug_pl = slugify(state.name_pl, { lower: true, strict: true })
  }
}

function onSlugPlInput(value: string | number) {
  slugPlManuallyEdited.value = String(value ?? '').length > 0
}

const schema = computed(() =>
  mode.value === 'create'
    ? createCategoryCreateSchema(t)
    : createCategoryUpdateSchema(t),
)

async function validate(values: typeof state): Promise<FormError[]> {
  const result = schema.value.safeParse(values)
  if (result.success) return []
  return result.error.issues.map(issue => ({
    name: String(issue.path[0] ?? ''),
    message: issue.message,
  }))
}

function nullable(s: string): string | null {
  const trimmed = s.trim()
  return trimmed.length === 0 ? null : trimmed
}

// The visible Save button lives in the modal footer, outside the <form>, so a
// native `type="submit"` can't reach it. Route its click through the form's
// hidden submit button so the browser fires a real submit and `:validate` runs
// before `@submit` — calling onSubmit directly (the old behaviour) skipped
// validation entirely and let empty/invalid values POST to the server.
const submitRef = ref<HTMLButtonElement | null>(null)

function onSubmit(_event: FormSubmitEvent<typeof state>) {
  emit('submit', {
    name: state.name,
    slug: state.slug,
    description: nullable(state.description),
    is_active: state.is_active,
    name_pl: nullable(state.name_pl),
    slug_pl: nullable(state.slug_pl),
    description_pl: nullable(state.description_pl),
    meta_title: nullable(state.meta_title),
    meta_description: nullable(state.meta_description),
    meta_title_pl: nullable(state.meta_title_pl),
    meta_description_pl: nullable(state.meta_description_pl),
    google_product_category: nullable(state.google_product_category),
    heroFile: heroFile.value,
    heroAlt: heroAlt.value.trim(),
    removeExistingHero: removeExistingHero.value,
  })
}

function onHeroFile(file: File | null) {
  heroFile.value = file
}

function onHeroAlt(alt: string) {
  heroAlt.value = alt
}

function onRemoveExistingHero() {
  removeExistingHero.value = true
}

const tabs = computed(() => [
  { value: 'en' as const, label: t('admin.categories.tabs.en', { default: 'English' }) },
  { value: 'pl' as const, label: t('admin.categories.tabs.pl', { default: 'Polski' }) },
])

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
    :ui="{ content: 'max-w-2xl' }"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        class="mb-4"
        :title="t('messages.saveErrorTitle')"
        :description="errorMessage"
        :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
        @close="errorMessage = ''"
      />
      <UForm
        ref="formRef"
        :state="state"
        :validate="validate"
        :validate-on="[]"
        class="space-y-6"
        @submit="onSubmit"
      >
        <UTabs
          v-model="localeTab"
          :items="tabs"
          value-key="value"
          variant="link"
        />

        <div
          v-show="localeTab === 'en'"
          class="space-y-4"
          data-locale-pane="en"
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
              @update:model-value="onSlugInput"
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
        </div>

        <div
          v-show="localeTab === 'pl'"
          class="space-y-4"
          data-locale-pane="pl"
        >
          <UFormField
            :label="t('admin.categories.fields.name', { default: 'Name' })"
            name="name_pl"
          >
            <UInput
              v-model="state.name_pl"
              :placeholder="t('admin.categories.placeholders.namePl', { default: 'Książki' })"
              :disabled="loading"
              class="w-full"
              @blur="onNamePlBlur"
            />
          </UFormField>

          <UFormField
            :label="t('admin.categories.fields.slug', { default: 'Slug' })"
            name="slug_pl"
            :hint="t('admin.categories.fields.slugHint', {
              default: 'Lowercase letters, numbers, and hyphens',
            })"
          >
            <UInput
              v-model="state.slug_pl"
              :placeholder="t('admin.categories.placeholders.slugPl', { default: 'ksiazki' })"
              :disabled="loading"
              class="w-full"
              @update:model-value="onSlugPlInput"
            />
          </UFormField>

          <UFormField
            :label="t('admin.categories.fields.description', { default: 'Description' })"
            name="description_pl"
          >
            <UTextarea
              v-model="state.description_pl"
              :placeholder="t('admin.categories.placeholders.descriptionPl', {
                default: 'Opcjonalny opis',
              })"
              :disabled="loading"
              class="w-full"
              :rows="3"
            />
          </UFormField>
        </div>

        <UFormField name="is_active">
          <UCheckbox
            v-model="state.is_active"
            :label="t('admin.categories.fields.isActive', { default: 'Active' })"
            :disabled="loading"
          />
        </UFormField>

        <UFormField
          :label="t('admin.categories.fields.googleProductCategory', { default: 'Google Product Category' })"
          name="google_product_category"
          :hint="t('admin.categories.hints.googleProductCategory', { default: 'Numeric taxonomy ID from Google\'s product taxonomy (e.g. 5613 for Apparel). Acts as default for all products in this category.' })"
        >
          <UInput
            v-model="state.google_product_category"
            :placeholder="t('admin.categories.placeholders.googleProductCategory', { default: 'e.g. 5613' })"
            :disabled="loading"
            maxlength="20"
            class="w-full"
          />
        </UFormField>

        <details class="border border-default rounded-md">
          <summary class="px-3 py-2 cursor-pointer text-sm font-medium select-none">
            {{ t('admin.categories.seo.section', { default: 'SEO meta' }) }}
          </summary>
          <div class="p-3 pt-2 space-y-4">
            <p class="text-xs text-muted">
              {{ seoHint }}
            </p>
            <div
              v-show="localeTab === 'en'"
              class="space-y-4"
              data-seo-pane="en"
            >
              <UFormField
                :label="t('admin.categories.seo.metaTitle', { default: 'Meta title' })"
                name="meta_title"
              >
                <UInput
                  v-model="state.meta_title"
                  :disabled="loading"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="t('admin.categories.seo.metaDescription', { default: 'Meta description' })"
                name="meta_description"
              >
                <UTextarea
                  v-model="state.meta_description"
                  :disabled="loading"
                  class="w-full"
                  :rows="2"
                />
              </UFormField>
            </div>
            <div
              v-show="localeTab === 'pl'"
              class="space-y-4"
              data-seo-pane="pl"
            >
              <UFormField
                :label="t('admin.categories.seo.metaTitle', { default: 'Meta title' })"
                name="meta_title_pl"
              >
                <UInput
                  v-model="state.meta_title_pl"
                  :disabled="loading"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="t('admin.categories.seo.metaDescription', { default: 'Meta description' })"
                name="meta_description_pl"
              >
                <UTextarea
                  v-model="state.meta_description_pl"
                  :disabled="loading"
                  class="w-full"
                  :rows="2"
                />
              </UFormField>
            </div>
          </div>
        </details>

        <div class="space-y-2">
          <p class="text-sm font-medium">
            {{ t('admin.categories.hero.section', { default: 'Hero image' }) }}
          </p>
          <AdminCategoryHeroStaging
            :existing-url="existingHero"
            :existing-alt="existingHeroAlt"
            :disabled="loading"
            @update:file="onHeroFile"
            @update:alt="onHeroAlt"
            @remove-existing="onRemoveExistingHero"
          />
        </div>

        <button
          ref="submitRef"
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
          @click="submitRef?.click()"
        >
          {{ t('admin.categories.actions.save', { default: 'Save' }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
