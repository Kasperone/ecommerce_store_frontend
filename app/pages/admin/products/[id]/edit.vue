<script setup lang="ts">
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProductFormPayload } from '~/components/admin/ProductForm.vue'
import {
  buildMatrixBody,
  MAX_VARIANTS,
  optionsToDrafts,
  variantsToDrafts,
  type OptionDraft,
  type VariantRowDraft,
} from '~/composables/queries/useVariantQueries'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const productId = computed(() => Number(route.params.id))

const { data: product, error: loadError } = useProductQuery(productId)
const { data: categoriesData } = useCategoriesQuery({ isActive: true, limit: 100 })
const categories = computed(() => categoriesData.value ?? [])

const { data: taxCategoriesData } = useTaxCategoriesQuery()
const taxCategories = computed(() => taxCategoriesData.value ?? [])

useHead({
  title: () => product.value
    ? t('admin.products.titleEdit') + ' - ' + product.value.name
    : t('admin.products.titleEdit'),
})

const updateMutation = useUpdateProduct()
const formError = ref<unknown>(null)

const justCreated = ref(route.query.created === '1')
function dismissCreated() {
  justCreated.value = false
  const { created: _created, ...rest } = route.query
  void router.replace({ query: rest })
}

async function onSubmit(payload: ProductFormPayload) {
  formError.value = null
  try {
    await updateMutation.mutateAsync({ id: productId.value, patch: payload })
  }
  catch (err) {
    formError.value = err
  }
}

// --- Variants section (variants F1) ------------------------------------
// Seeds re-mount the editor + matrix (via `matrixVersion`) from server truth
// after every successful save; live drafts flow up from the two children.
const variantsQuery = useProductVariantsQuery(productId)
const matrixMutation = useUpdateOptionsMatrix()

const seedOptions = ref<OptionDraft[] | null>(null)
const seedRows = ref<VariantRowDraft[] | null>(null)
const matrixVersion = ref(0)
const optionsDraft = ref<OptionDraft[]>([])
const variantRows = ref<VariantRowDraft[]>([])

watch(
  [product, variantsQuery.data],
  ([loadedProduct, loadedVariants]) => {
    if (seedOptions.value !== null) return
    if (!loadedProduct || !loadedVariants) return
    seedOptions.value = optionsToDrafts(loadedProduct.options ?? [])
    seedRows.value = variantsToDrafts(loadedVariants, loadedProduct.options ?? [])
    // Pre-populate the live drafts so the matrix sees the real options on its
    // very first mount (children only emit on mounted, one tick later).
    optionsDraft.value = optionsToDrafts(loadedProduct.options ?? [])
    variantRows.value = variantsToDrafts(loadedVariants, loadedProduct.options ?? [])
  },
  { immediate: true },
)

// §0 transition warning: a product holding stock that gains its FIRST option
// has its product-grain stock zeroed on save — per-variant stock takes over.
const firstOptionStockWarning = computed(() =>
  (product.value?.stock ?? 0) > 0
  && (product.value?.options?.length ?? 0) === 0
  && optionsDraft.value.some(option => option.name.trim() !== ''),
)

// No UForm/Zod here (the matrix is a structural editor, not a field form) —
// message + toast only, per the no-validatable-field convention.
const { errorMessage: variantsError, applyApiError: applyVariantsError }
  = useValidatedForm(ref(null), {
    toast,
    t,
    toastTitleKey: 'admin.products.variants.errors.saveErrorTitle',
  })

function validateMatrix(): string | null {
  for (const option of optionsDraft.value) {
    const hasValues = option.values.some(value => value.value.trim() !== '')
    if (option.name.trim() === '' && hasValues) {
      return t('admin.products.variants.errors.optionNameRequired')
    }
    if (option.name.trim() !== '' && !hasValues) {
      return t('admin.products.variants.errors.optionValuesRequired', { name: option.name.trim() })
    }
  }
  if (variantRows.value.length > MAX_VARIANTS) {
    return t('admin.products.variants.errors.tooManyVariants', { max: MAX_VARIANTS })
  }
  return null
}

async function saveVariants() {
  variantsError.value = ''
  const clientError = validateMatrix()
  if (clientError) {
    variantsError.value = clientError
    return
  }
  try {
    const result = await matrixMutation.mutateAsync({
      productId: productId.value,
      matrix: buildMatrixBody(optionsDraft.value, variantRows.value),
    })
    seedOptions.value = optionsToDrafts(result.options ?? [])
    seedRows.value = variantsToDrafts(result.variants ?? [], result.options ?? [])
    optionsDraft.value = optionsToDrafts(result.options ?? [])
    variantRows.value = variantsToDrafts(result.variants ?? [], result.options ?? [])
    matrixVersion.value += 1
    toast.add({
      title: t('admin.products.variants.saved'),
      color: 'success',
      icon: 'i-lucide-check-circle',
    })
  }
  catch (err) {
    applyVariantsError(err, t('admin.products.variants.errors.fallback'))
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-4xl">
      <header class="flex items-center gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          :aria-label="$t('admin.products.actions.backToList')"
          @click="navigateTo(localePath('/admin/products'))"
        />
        <div class="flex-1">
          <h1 class="text-2xl font-bold">
            {{ product?.name ?? $t('admin.products.titleEdit') }}
          </h1>
          <p class="text-muted text-sm">
            {{ product?.slug ?? '' }}
          </p>
        </div>
      </header>

      <UAlert
        v-if="justCreated"
        color="success"
        variant="subtle"
        icon="i-lucide-check-circle"
        :title="$t('admin.products.flashes.created')"
        :close-button="{ 'aria-label': $t('admin.products.flashes.createdDismiss') }"
        @close="dismissCreated"
      />

      <ErrorAlert
        v-if="loadError"
        :problem="parseProblem(loadError)"
      />

      <div
        v-if="!product && !loadError"
        class="text-muted text-sm py-12 text-center"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin inline-block mr-2"
        />
        {{ $t('admin.products.loading') }}
      </div>

      <template v-else-if="product">
        <AdminProductForm
          :categories="categories"
          :tax-categories="taxCategories"
          :product="product"
          :loading="updateMutation.isLoading.value"
          :error="formError"
          @submit="onSubmit"
          @cancel="navigateTo(localePath('/admin/products'))"
        />

        <section class="space-y-4">
          <h2 class="text-lg font-semibold">
            {{ $t('admin.products.sections.media') }}
          </h2>

          <AdminProductImageUploader :product-id="product.id" />

          <div
            v-if="product.images.length === 0"
            class="text-muted text-sm py-6 text-center"
          >
            {{ $t('admin.products.media.emptyGallery') }}
          </div>
          <AdminProductImageGallery
            v-else
            :product-id="product.id"
            :images="product.images"
          />
        </section>

        <section
          class="space-y-4"
          data-testid="variants-section"
        >
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-lg font-semibold">
              {{ $t('admin.products.sections.variants') }}
            </h2>
            <span class="text-sm text-muted">
              {{ $t('admin.products.variants.count', { count: variantRows.length }, variantRows.length) }}
            </span>
          </div>
          <p class="text-muted text-sm">
            {{ $t('admin.products.variants.subtitle') }}
          </p>

          <UAlert
            v-if="firstOptionStockWarning"
            color="warning"
            variant="subtle"
            icon="i-lucide-alert-triangle"
            :title="$t('admin.products.variants.stockResetWarningTitle')"
            :description="$t('admin.products.variants.stockResetWarning')"
            data-testid="variants-stock-reset-warning"
          />

          <UAlert
            v-if="variantsError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-x"
            :description="variantsError"
            data-testid="variants-error"
          />

          <div
            v-if="seedOptions === null"
            class="text-muted text-sm py-6 text-center"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="animate-spin inline-block mr-2"
            />
            {{ $t('admin.products.loading') }}
          </div>
          <div
            v-else
            :key="matrixVersion"
            class="space-y-4"
          >
            <AdminProductOptionsEditor
              :initial="seedOptions"
              :disabled="matrixMutation.isLoading.value"
              @update:options="optionsDraft = $event"
            />
            <AdminProductVariantsMatrix
              :options="optionsDraft"
              :initial-rows="seedRows ?? []"
              :product-price-usd="product.price_usd"
              :product-price-pln="product.price_pln"
              :product-price-eur="product.price_eur"
              :images="product.images ?? []"
              :disabled="matrixMutation.isLoading.value"
              @update:rows="variantRows = $event"
            />
            <div class="flex justify-end">
              <UButton
                color="primary"
                :loading="matrixMutation.isLoading.value"
                data-testid="variants-save"
                @click="saveVariants"
              >
                {{ $t('admin.products.variants.save') }}
              </UButton>
            </div>
          </div>
        </section>
      </template>
    </div>
  </NuxtLayout>
</template>
