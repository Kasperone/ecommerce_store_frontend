<script setup lang="ts">
import slugify from 'slugify'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import type {
  CollectionResponse,
  CollectionWithProductCount,
} from '#shared/types/api'
import type { MemberRow } from '~/components/admin/CollectionMembershipEditor.vue'
import {
  createCollectionCreateSchema,
  createCollectionUpdateSchema,
} from '#shared/validators/collection'

/**
 * Per-locale tabs + SEO meta + hero staging + ordered membership.
 *
 * Mirrors `CategoryFormModal.vue` (collections are Category-shaped) MINUS the
 * smart-rules surface — v1 is manual-only, so `type`/`rules` are never authored.
 * Adds a `sort_order` field and (edit mode only) the membership editor.
 *
 * The page handles the multi-step orchestration: POST/PUT collection, then the
 * hero upload + the membership PUT.
 */

type LocaleTab = 'en' | 'pl'

export interface CollectionFormSubmit {
  name: string
  slug: string
  description: string | null
  is_active: boolean
  sort_order: number
  name_pl: string | null
  slug_pl: string | null
  description_pl: string | null
  meta_title: string | null
  meta_description: string | null
  meta_title_pl: string | null
  meta_description_pl: string | null
  heroFile: File | null
  heroAlt: string
  removeExistingHero: boolean
  /** Ordered member product ids (edit mode); the page PUTs these. */
  memberIds: number[]
}

const props = defineProps<{
  open: boolean
  collection?: CollectionResponse | CollectionWithProductCount | null
  /** Current ordered members, seeded into the membership editor (edit mode). */
  members?: MemberRow[]
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [value: CollectionFormSubmit]
  'cancel': []
}>()

const { t } = useI18n()
const toast = useToast()
const mode = computed<'create' | 'edit'>(() => (props.collection ? 'edit' : 'create'))
const seoHint = computed(() =>
  t('admin.collections.seo.hint', {
    default: 'Optional. Used as the page title and meta description for the storefront collection page.',
  }),
)

const state = reactive({
  name: '',
  slug: '',
  description: '' as string,
  is_active: true,
  sort_order: 0,
  name_pl: '' as string,
  slug_pl: '' as string,
  description_pl: '' as string,
  meta_title: '' as string,
  meta_description: '' as string,
  meta_title_pl: '' as string,
  meta_description_pl: '' as string,
})

const slugEnManuallyEdited = ref(false)
const slugPlManuallyEdited = ref(false)
const heroFile = ref<File | null>(null)
const heroAlt = ref('')
const removeExistingHero = ref(false)
const localeTab = ref<LocaleTab>('en')
const memberRows = ref<MemberRow[]>([])

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

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
    : (props.collection as CollectionResponse | undefined)?.hero_image_url ?? null,
)
const existingHeroAlt = computed(() =>
  (props.collection as CollectionResponse | undefined)?.hero_image_alt ?? null,
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    localeTab.value = 'en'
    heroFile.value = null
    heroAlt.value = existingHeroAlt.value ?? ''
    removeExistingHero.value = false
    memberRows.value = [...(props.members ?? [])]
    if (props.collection) {
      const c = props.collection as CollectionResponse
      state.name = c.name
      state.slug = c.slug
      state.description = c.description ?? ''
      state.is_active = c.is_active
      state.sort_order = c.sort_order ?? 0
      state.name_pl = c.name_pl ?? ''
      state.slug_pl = c.slug_pl ?? ''
      state.description_pl = c.description_pl ?? ''
      state.meta_title = c.meta_title ?? ''
      state.meta_description = c.meta_description ?? ''
      state.meta_title_pl = c.meta_title_pl ?? ''
      state.meta_description_pl = c.meta_description_pl ?? ''
      slugEnManuallyEdited.value = true
      slugPlManuallyEdited.value = state.slug_pl.length > 0
    }
    else {
      state.name = ''
      state.slug = ''
      state.description = ''
      state.is_active = true
      state.sort_order = 0
      state.name_pl = ''
      state.slug_pl = ''
      state.description_pl = ''
      state.meta_title = ''
      state.meta_description = ''
      state.meta_title_pl = ''
      state.meta_description_pl = ''
      slugEnManuallyEdited.value = false
      slugPlManuallyEdited.value = false
    }
  },
  { immediate: true },
)

// Re-seed members when the parent's member list resolves (the products query is
// async and can land after the modal opens).
watch(
  () => props.members,
  (incoming) => {
    if (props.open) memberRows.value = [...(incoming ?? [])]
  },
)

function onNameBlur() {
  if (!slugEnManuallyEdited.value && state.name) {
    state.slug = slugify(state.name, { lower: true, strict: true })
  }
}

function onSlugInput(value: string | number) {
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
    ? createCollectionCreateSchema(t)
    : createCollectionUpdateSchema(t),
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

const submitRef = ref<HTMLButtonElement | null>(null)

function onSubmit(_event: FormSubmitEvent<typeof state>) {
  emit('submit', {
    name: state.name,
    slug: state.slug,
    description: nullable(state.description),
    is_active: state.is_active,
    sort_order: state.sort_order,
    name_pl: nullable(state.name_pl),
    slug_pl: nullable(state.slug_pl),
    description_pl: nullable(state.description_pl),
    meta_title: nullable(state.meta_title),
    meta_description: nullable(state.meta_description),
    meta_title_pl: nullable(state.meta_title_pl),
    meta_description_pl: nullable(state.meta_description_pl),
    heroFile: heroFile.value,
    heroAlt: heroAlt.value.trim(),
    removeExistingHero: removeExistingHero.value,
    memberIds: memberRows.value.map(m => m.id),
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
  { value: 'en' as const, label: t('admin.collections.tabs.en', { default: 'English' }) },
  { value: 'pl' as const, label: t('admin.collections.tabs.pl', { default: 'Polski' }) },
])

const title = computed(() =>
  mode.value === 'create'
    ? t('admin.collections.actions.create', { default: 'New collection' })
    : t('admin.collections.actions.edit', { default: 'Edit collection' }),
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
        :validate-on="['submit']"
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
            :label="t('admin.collections.fields.name', { default: 'Name' })"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              :placeholder="t('admin.collections.placeholders.name', { default: 'Summer sale' })"
              :disabled="loading"
              class="w-full"
              @blur="onNameBlur"
            />
          </UFormField>

          <UFormField
            :label="t('admin.collections.fields.slug', { default: 'Slug' })"
            name="slug"
            required
            :hint="t('admin.collections.fields.slugHint', {
              default: 'Lowercase letters, numbers, and hyphens',
            })"
          >
            <UInput
              v-model="state.slug"
              :placeholder="t('admin.collections.placeholders.slug', { default: 'summer-sale' })"
              :disabled="loading"
              class="w-full"
              @update:model-value="onSlugInput"
            />
          </UFormField>

          <UFormField
            :label="t('admin.collections.fields.description', { default: 'Description' })"
            name="description"
          >
            <UTextarea
              v-model="state.description"
              :placeholder="t('admin.collections.placeholders.description', {
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
            :label="t('admin.collections.fields.name', { default: 'Name' })"
            name="name_pl"
          >
            <UInput
              v-model="state.name_pl"
              :placeholder="t('admin.collections.placeholders.namePl', { default: 'Wyprzedaż letnia' })"
              :disabled="loading"
              class="w-full"
              @blur="onNamePlBlur"
            />
          </UFormField>

          <UFormField
            :label="t('admin.collections.fields.slug', { default: 'Slug' })"
            name="slug_pl"
            :hint="t('admin.collections.fields.slugHint', {
              default: 'Lowercase letters, numbers, and hyphens',
            })"
          >
            <UInput
              v-model="state.slug_pl"
              :placeholder="t('admin.collections.placeholders.slugPl', { default: 'wyprzedaz-letnia' })"
              :disabled="loading"
              class="w-full"
              @update:model-value="onSlugPlInput"
            />
          </UFormField>

          <UFormField
            :label="t('admin.collections.fields.description', { default: 'Description' })"
            name="description_pl"
          >
            <UTextarea
              v-model="state.description_pl"
              :placeholder="t('admin.collections.placeholders.descriptionPl', {
                default: 'Opcjonalny opis',
              })"
              :disabled="loading"
              class="w-full"
              :rows="3"
            />
          </UFormField>
        </div>

        <div class="flex flex-wrap items-center gap-6">
          <UFormField name="is_active">
            <UCheckbox
              v-model="state.is_active"
              :label="t('admin.collections.fields.isActive', { default: 'Active' })"
              :disabled="loading"
            />
          </UFormField>
          <UFormField
            :label="t('admin.collections.fields.sortOrder', { default: 'Sort order' })"
            name="sort_order"
            class="max-w-32"
          >
            <UInputNumber
              v-model="state.sort_order"
              :min="0"
              :step="1"
              :disabled="loading"
              class="w-full"
            />
          </UFormField>
        </div>

        <details class="border border-default rounded-md">
          <summary class="px-3 py-2 cursor-pointer text-sm font-medium select-none">
            {{ t('admin.collections.seo.section', { default: 'SEO meta' }) }}
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
                :label="t('admin.collections.seo.metaTitle', { default: 'Meta title' })"
                name="meta_title"
              >
                <UInput
                  v-model="state.meta_title"
                  :disabled="loading"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="t('admin.collections.seo.metaDescription', { default: 'Meta description' })"
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
                :label="t('admin.collections.seo.metaTitle', { default: 'Meta title' })"
                name="meta_title_pl"
              >
                <UInput
                  v-model="state.meta_title_pl"
                  :disabled="loading"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="t('admin.collections.seo.metaDescription', { default: 'Meta description' })"
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
            {{ t('admin.collections.hero.section', { default: 'Hero image' }) }}
          </p>
          <AdminCollectionHeroStaging
            :existing-url="existingHero"
            :existing-alt="existingHeroAlt"
            :disabled="loading"
            @update:file="onHeroFile"
            @update:alt="onHeroAlt"
            @remove-existing="onRemoveExistingHero"
          />
        </div>

        <div
          v-if="mode === 'edit'"
          class="space-y-2"
        >
          <p class="text-sm font-medium">
            {{ t('admin.collections.membership.section', { default: 'Products' }) }}
          </p>
          <p class="text-xs text-muted">
            {{ t('admin.collections.membership.hint', {
              default: 'Search to add products. Drag order is curation order on the storefront.',
            }) }}
          </p>
          <AdminCollectionMembershipEditor
            v-model="memberRows"
            :disabled="loading"
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
          {{ t('admin.collections.actions.cancel', { default: 'Cancel' }) }}
        </UButton>
        <UButton
          color="primary"
          :loading="loading"
          @click="submitRef?.click()"
        >
          {{ t('admin.collections.actions.save', { default: 'Save' }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
