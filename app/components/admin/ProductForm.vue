<script setup lang="ts">
import slugify from 'slugify'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type {
  CategoryResponse,
  ProductWithCategory,
} from '#shared/types/api'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import {
  createProductCreateSchema,
  createProductUpdateSchema,
} from '#shared/validators/product'

export type ProductCondition = 'new' | 'refurbished' | 'used'

export interface ProductFormPayload {
  name: string
  name_pl: string | null
  slug: string
  description: string | null
  description_pl: string | null
  sku: string | null
  // Merchant identity + per-locale SEO meta (SEO blueprint D11) — feed the
  // PDP's Product JSON-LD and, post-deploy, the merchant feeds.
  brand: string | null
  gtin: string | null
  mpn: string | null
  condition: ProductCondition
  google_product_category: string | null
  meta_title: string | null
  meta_description: string | null
  meta_title_pl: string | null
  meta_description_pl: string | null
  price_usd: number | null
  price_pln: number | null
  price_eur: number | null
  vat_rate: number
  stock: number
  weight_kg: number | null
  // Physical dimensions in cm; nullable so legacy products and admins
  // who haven't measured yet stay valid. Drives volumetric shipping
  // pricing alongside the zone's dim_divisor (the backend computes
  // billable = max(actual, volumetric) at checkout).
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  allow_backorder: boolean
  is_active: boolean
  is_featured: boolean
  category_id: number | null
  // Free-form product tags (names). The backend get-or-creates each name and
  // reconciles the join; `[]` clears, names are case-insensitively deduped.
  tags: string[]
}

const props = defineProps<{
  /** Existing product to edit; omit for create mode. */
  product?: ProductWithCategory | null
  categories: CategoryResponse[]
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
  submitLabel?: string
}>()

const emit = defineEmits<{
  submit: [value: ProductFormPayload]
  cancel: []
}>()

const { t } = useI18n()
const toast = useToast()
const mode = computed<'create' | 'edit'>(() => (props.product ? 'edit' : 'create'))

interface FormState {
  name: string
  name_pl: string
  slug: string
  description: string
  description_pl: string
  sku: string
  brand: string
  gtin: string
  mpn: string
  condition: ProductCondition
  google_product_category: string
  meta_title: string
  meta_description: string
  meta_title_pl: string
  meta_description_pl: string
  price_usd: number | undefined
  price_pln: number | undefined
  price_eur: number | undefined
  vat_rate: number
  stock: number
  weight_kg: number | undefined
  length_cm: number | undefined
  width_cm: number | undefined
  height_cm: number | undefined
  allow_backorder: boolean
  is_active: boolean
  is_featured: boolean
  category_id: number | undefined
}

const state = reactive<FormState>({
  name: '',
  name_pl: '',
  slug: '',
  description: '',
  description_pl: '',
  sku: '',
  brand: '',
  gtin: '',
  mpn: '',
  condition: 'new',
  google_product_category: '',
  meta_title: '',
  meta_description: '',
  meta_title_pl: '',
  meta_description_pl: '',
  price_usd: undefined,
  price_pln: undefined,
  price_eur: undefined,
  vat_rate: 23,
  stock: 0,
  weight_kg: undefined,
  length_cm: undefined,
  width_cm: undefined,
  height_cm: undefined,
  allow_backorder: false,
  is_active: true,
  is_featured: false,
  category_id: undefined,
})

// Product tags are NOT a UForm/Zod field (free-form chips, no validation) — a
// plain string[] ref seeded from the product, emitted in the submit payload.
const tags = ref<string[]>([])

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

// The page owns the create/update fetch; surface its raw error here so the
// form drives the same flow as signin (message + backend field mapping).
watch(
  () => props.error,
  (err) => {
    if (err) applyApiError(err, t('messages.saveError'))
    else errorMessage.value = ''
  },
)

const slugManuallyEdited = ref(false)

// EN/PL locale tabs for the localized title + description (mirrors the
// category form). Slug/SKU/category/pricing are shared, not per-locale.
const localeTab = ref<'en' | 'pl'>('en')
const localeTabItems = computed(() => [
  { value: 'en' as const, label: t('admin.products.tabs.en', { default: 'English' }) },
  { value: 'pl' as const, label: t('admin.products.tabs.pl', { default: 'Polski' }) },
])

watch(
  () => props.product,
  (product) => {
    if (product) {
      state.name = product.name
      state.name_pl = product.name_pl ?? ''
      state.slug = product.slug
      state.description = product.description ?? ''
      state.description_pl = product.description_pl ?? ''
      state.sku = product.sku ?? ''
      state.brand = product.brand ?? ''
      state.gtin = product.gtin ?? ''
      state.mpn = product.mpn ?? ''
      state.condition = (product.condition ?? 'new') as ProductCondition
      state.google_product_category = product.google_product_category ?? ''
      state.meta_title = product.meta_title ?? ''
      state.meta_description = product.meta_description ?? ''
      state.meta_title_pl = product.meta_title_pl ?? ''
      state.meta_description_pl = product.meta_description_pl ?? ''
      state.price_usd = product.price_usd ?? undefined
      state.price_pln = product.price_pln ?? undefined
      state.price_eur = product.price_eur ?? undefined
      state.vat_rate = product.vat_rate ?? 23
      state.stock = product.stock
      state.weight_kg = product.weight_kg ?? undefined
      state.length_cm = product.length_cm ?? undefined
      state.width_cm = product.width_cm ?? undefined
      state.height_cm = product.height_cm ?? undefined
      state.allow_backorder = product.allow_backorder
      state.is_active = product.is_active
      state.is_featured = product.is_featured
      state.category_id = product.category_id ?? undefined
      tags.value = (product.tags ?? []).map(tag => tag.name)
      slugManuallyEdited.value = true
    }
    else {
      state.name = ''
      state.name_pl = ''
      state.slug = ''
      state.description = ''
      state.description_pl = ''
      state.sku = ''
      state.brand = ''
      state.gtin = ''
      state.mpn = ''
      state.condition = 'new'
      state.google_product_category = ''
      state.meta_title = ''
      state.meta_description = ''
      state.meta_title_pl = ''
      state.meta_description_pl = ''
      state.price_usd = undefined
      state.price_pln = undefined
      state.price_eur = undefined
      state.vat_rate = 23
      state.stock = 0
      state.weight_kg = undefined
      state.length_cm = undefined
      state.width_cm = undefined
      state.height_cm = undefined
      state.allow_backorder = false
      state.is_active = true
      state.is_featured = false
      state.category_id = undefined
      tags.value = []
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

function onSlugInput(value: string | number) {
  // Read the v-model value directly so we don't race the state-write order
  // (in happy-dom @input can fire before v-model's @update:model-value).
  slugManuallyEdited.value = String(value ?? '').length > 0
}

const schema = computed(() =>
  mode.value === 'create' ? createProductCreateSchema(t) : createProductUpdateSchema(t),
)

async function validate(values: FormState): Promise<FormError[]> {
  // The form always renders all three currency fields, so an empty field maps
  // to `undefined` in state. We coerce to `null` here so the schema's
  // at-least-one check (which uses `=== null` on update to distinguish "user
  // cleared" from "JS client omitted the key") matches in both modes.
  const candidate = {
    ...values,
    name_pl: values.name_pl.trim() || null,
    description: values.description.trim() || null,
    description_pl: values.description_pl.trim() || null,
    sku: values.sku.trim() || null,
    brand: values.brand.trim() || null,
    gtin: values.gtin.trim() || null,
    mpn: values.mpn.trim() || null,
    google_product_category: values.google_product_category.trim() || null,
    meta_title: values.meta_title.trim() || null,
    meta_description: values.meta_description.trim() || null,
    meta_title_pl: values.meta_title_pl.trim() || null,
    meta_description_pl: values.meta_description_pl.trim() || null,
    category_id: values.category_id ?? null,
    price_usd: values.price_usd ?? null,
    price_pln: values.price_pln ?? null,
    price_eur: values.price_eur ?? null,
    weight_kg: values.weight_kg ?? null,
    length_cm: values.length_cm ?? null,
    width_cm: values.width_cm ?? null,
    height_cm: values.height_cm ?? null,
  }
  const result = schema.value.safeParse(candidate)
  if (result.success) return []
  return result.error.issues.map(issue => ({
    name: String(issue.path[0] ?? ''),
    message: issue.message,
  }))
}

function buildPayload(): ProductFormPayload {
  return {
    name: state.name,
    name_pl: state.name_pl.trim() || null,
    slug: state.slug,
    description: state.description.trim() || null,
    description_pl: state.description_pl.trim() || null,
    sku: state.sku.trim() || null,
    brand: state.brand.trim() || null,
    gtin: state.gtin.trim() || null,
    mpn: state.mpn.trim() || null,
    condition: state.condition,
    google_product_category: state.google_product_category.trim() || null,
    meta_title: state.meta_title.trim() || null,
    meta_description: state.meta_description.trim() || null,
    meta_title_pl: state.meta_title_pl.trim() || null,
    meta_description_pl: state.meta_description_pl.trim() || null,
    price_usd: state.price_usd ?? null,
    price_pln: state.price_pln ?? null,
    price_eur: state.price_eur ?? null,
    vat_rate: state.vat_rate,
    stock: state.stock,
    weight_kg: state.weight_kg ?? null,
    length_cm: state.length_cm ?? null,
    width_cm: state.width_cm ?? null,
    height_cm: state.height_cm ?? null,
    allow_backorder: state.allow_backorder,
    is_active: state.is_active,
    is_featured: state.is_featured,
    category_id: state.category_id ?? null,
    tags: [...tags.value],
  }
}

function onSubmit(_event: FormSubmitEvent<FormState>) {
  emit('submit', buildPayload())
}

// schema.org-mappable condition vocabulary (backend CHECK constraint).
const conditionItems = computed(() => [
  { label: t('admin.products.condition.new', { default: 'New' }), value: 'new' as const },
  { label: t('admin.products.condition.refurbished', { default: 'Refurbished' }), value: 'refurbished' as const },
  { label: t('admin.products.condition.used', { default: 'Used' }), value: 'used' as const },
])

const NO_CATEGORY = 0
const categoryItems = computed(() => [
  { label: t('admin.products.fields.noCategory'), value: NO_CATEGORY },
  ...props.categories.map(c => ({ label: c.name, value: c.id })),
])

const categoryValue = computed({
  get: () => state.category_id ?? NO_CATEGORY,
  set: (v: number) => {
    state.category_id = v === NO_CATEGORY ? undefined : v
  },
})

const submitLabel = computed(() => props.submitLabel ?? t('admin.products.actions.save'))
</script>

<template>
  <UForm
    ref="formRef"
    :state="state"
    :validate="validate"
    :validate-on="['submit']"
    class="space-y-8"
    @submit="onSubmit"
  >
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="t('messages.saveErrorTitle')"
      :description="errorMessage"
      :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
      @close="errorMessage = ''"
    />

    <section class="space-y-4">
      <h2 class="text-lg font-semibold">
        {{ t('admin.products.sections.basics') }}
      </h2>

      <UTabs
        v-model="localeTab"
        :items="localeTabItems"
        class="w-full"
      />

      <div
        v-show="localeTab === 'en'"
        class="space-y-4"
      >
        <UFormField
          :label="t('admin.products.fields.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            :placeholder="t('admin.products.placeholders.name')"
            :disabled="loading"
            class="w-full"
            @blur="onNameBlur"
          />
        </UFormField>

        <UFormField
          :label="t('admin.products.fields.description')"
          name="description"
        >
          <UTextarea
            v-model="state.description"
            :placeholder="t('admin.products.placeholders.description')"
            :disabled="loading"
            :rows="4"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.products.fields.metaTitle')"
          name="meta_title"
          :hint="t('admin.products.hints.metaTitle')"
        >
          <UInput
            v-model="state.meta_title"
            :placeholder="t('admin.products.placeholders.metaTitle')"
            :disabled="loading"
            maxlength="70"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.products.fields.metaDescription')"
          name="meta_description"
          :hint="t('admin.products.hints.metaDescription')"
        >
          <UTextarea
            v-model="state.meta_description"
            :placeholder="t('admin.products.placeholders.metaDescription')"
            :disabled="loading"
            :rows="2"
            maxlength="160"
            class="w-full"
          />
        </UFormField>
      </div>

      <div
        v-show="localeTab === 'pl'"
        class="space-y-4"
      >
        <UFormField
          :label="t('admin.products.fields.name')"
          name="name_pl"
          :hint="t('admin.products.hints.localeOptional')"
        >
          <UInput
            v-model="state.name_pl"
            :placeholder="t('admin.products.placeholders.namePl')"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.products.fields.description')"
          name="description_pl"
        >
          <UTextarea
            v-model="state.description_pl"
            :placeholder="t('admin.products.placeholders.descriptionPl')"
            :disabled="loading"
            :rows="4"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.products.fields.metaTitle')"
          name="meta_title_pl"
          :hint="t('admin.products.hints.localeOptional')"
        >
          <UInput
            v-model="state.meta_title_pl"
            :placeholder="t('admin.products.placeholders.metaTitlePl')"
            :disabled="loading"
            maxlength="70"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.products.fields.metaDescription')"
          name="meta_description_pl"
          :hint="t('admin.products.hints.localeOptional')"
        >
          <UTextarea
            v-model="state.meta_description_pl"
            :placeholder="t('admin.products.placeholders.metaDescriptionPl')"
            :disabled="loading"
            :rows="2"
            maxlength="160"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField
        :label="t('admin.products.fields.slug')"
        name="slug"
        required
        :hint="t('admin.products.hints.slug')"
      >
        <UInput
          v-model="state.slug"
          :placeholder="t('admin.products.placeholders.slug')"
          :disabled="loading"
          class="w-full"
          @update:model-value="onSlugInput"
        />
      </UFormField>

      <UFormField
        :label="t('admin.products.fields.sku')"
        name="sku"
        :hint="t('admin.products.hints.sku')"
      >
        <UInput
          v-model="state.sku"
          :placeholder="t('admin.products.placeholders.sku')"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <!-- Merchant identity (SEO blueprint D11): feeds the PDP's Product
           JSON-LD (rich results) and the future merchant feeds. -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField
          :label="t('admin.products.fields.brand')"
          name="brand"
          :hint="t('admin.products.hints.brand')"
        >
          <UInput
            v-model="state.brand"
            :placeholder="t('admin.products.placeholders.brand')"
            :disabled="loading"
            maxlength="100"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.fields.condition')"
          name="condition"
        >
          <USelectMenu
            v-model="state.condition"
            :items="conditionItems"
            value-key="value"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.fields.gtin')"
          name="gtin"
          :hint="t('admin.products.hints.gtin')"
        >
          <UInput
            v-model="state.gtin"
            :placeholder="t('admin.products.placeholders.gtin')"
            :disabled="loading"
            maxlength="14"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.fields.mpn')"
          name="mpn"
          :hint="t('admin.products.hints.mpn')"
        >
          <UInput
            v-model="state.mpn"
            :placeholder="t('admin.products.placeholders.mpn')"
            :disabled="loading"
            maxlength="70"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField
        :label="t('admin.products.fields.googleProductCategory')"
        name="google_product_category"
        :hint="t('admin.products.hints.googleProductCategory')"
      >
        <UInput
          v-model="state.google_product_category"
          :placeholder="t('admin.products.placeholders.googleProductCategory')"
          :disabled="loading"
          maxlength="20"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.products.fields.category')"
        name="category_id"
        :hint="t('admin.products.hints.category')"
      >
        <USelectMenu
          v-model="categoryValue"
          :items="categoryItems"
          value-key="value"
          searchable
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <div class="flex gap-6">
        <UFormField name="is_active">
          <UCheckbox
            v-model="state.is_active"
            :label="t('admin.products.fields.isActive')"
            :disabled="loading"
          />
        </UFormField>
        <UFormField name="is_featured">
          <UCheckbox
            v-model="state.is_featured"
            :label="t('admin.products.fields.isFeatured')"
            :disabled="loading"
          />
        </UFormField>
      </div>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.products.sections.pricing') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.products.hints.currency') }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <UFormField
            :label="t('admin.products.fields.priceUsd')"
            name="price_usd"
          >
            <UInputNumber
              v-model="state.price_usd"
              :min="0"
              :step="0.01"
              :disabled="loading"
              class="w-full"
            />
          </UFormField>
          <AdminProductLowest30dHint
            :product-id="product?.id"
            currency="USD"
          />
        </div>
        <div>
          <UFormField
            :label="t('admin.products.fields.pricePln')"
            name="price_pln"
          >
            <UInputNumber
              v-model="state.price_pln"
              :min="0"
              :step="0.01"
              :disabled="loading"
              class="w-full"
            />
          </UFormField>
          <AdminProductLowest30dHint
            :product-id="product?.id"
            currency="PLN"
          />
        </div>
        <div>
          <UFormField
            :label="t('admin.products.fields.priceEur')"
            name="price_eur"
          >
            <UInputNumber
              v-model="state.price_eur"
              :min="0"
              :step="0.01"
              :disabled="loading"
              class="w-full"
            />
          </UFormField>
          <AdminProductLowest30dHint
            :product-id="product?.id"
            currency="EUR"
          />
        </div>
      </div>

      <UFormField
        :label="t('admin.products.fields.vatRate')"
        name="vat_rate"
        :help="t('admin.products.fields.vatRateHelp')"
      >
        <UInputNumber
          v-model="state.vat_rate"
          :min="0"
          :max="100"
          :step="1"
          :disabled="loading"
          class="w-full sm:w-48"
        />
      </UFormField>

      <UFormField
        v-if="mode === 'create'"
        :label="t('admin.products.fields.stock')"
        :hint="t('admin.products.hints.stockCreateOnly')"
        name="stock"
        class="max-w-xs"
      >
        <UInputNumber
          v-model="state.stock"
          :min="0"
          :step="1"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
      <p
        v-else
        class="text-xs text-muted"
      >
        {{ t('admin.products.hints.stockEditViaInventory') }}
      </p>

      <UFormField
        :label="t('admin.products.fields.weightKg')"
        :hint="t('admin.products.hints.weightKg')"
        name="weight_kg"
        class="max-w-xs"
      >
        <UInputNumber
          v-model="state.weight_kg"
          :min="0"
          :step="0.1"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <!--
        Dimensions — three nullable cm fields driving volumetric shipping
        pricing (alongside the zone's dim_divisor on the backend). Convention
        is "all three set or none"; the backend resolver treats any-NULL as
        "no volumetric contribution" so a half-populated row is harmless.
      -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UFormField
          :label="t('admin.products.fields.lengthCm')"
          :hint="t('admin.products.hints.lengthCm')"
          name="length_cm"
        >
          <UInputNumber
            v-model="state.length_cm"
            :min="0"
            :step="1"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.fields.widthCm')"
          :hint="t('admin.products.hints.widthCm')"
          name="width_cm"
        >
          <UInputNumber
            v-model="state.width_cm"
            :min="0"
            :step="1"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.fields.heightCm')"
          :hint="t('admin.products.hints.heightCm')"
          name="height_cm"
        >
          <UInputNumber
            v-model="state.height_cm"
            :min="0"
            :step="1"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField
        name="allow_backorder"
        :help="t('admin.products.hints.allowBackorder')"
      >
        <UCheckbox
          v-model="state.allow_backorder"
          :label="t('admin.products.fields.allowBackorder')"
          :disabled="loading"
        />
      </UFormField>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.productTags.section') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.productTags.sectionHint') }}
        </p>
      </div>
      <AdminProductTagEditor
        v-model="tags"
        :disabled="loading"
      />
    </section>

    <slot name="extra-sections" />

    <div class="flex justify-end gap-2 pt-4 border-t border-default">
      <UButton
        color="neutral"
        variant="soft"
        :disabled="loading"
        @click="emit('cancel')"
      >
        {{ t('admin.products.actions.cancel') }}
      </UButton>
      <UButton
        type="submit"
        color="primary"
        :loading="loading"
      >
        {{ submitLabel }}
      </UButton>
    </div>
  </UForm>
</template>
