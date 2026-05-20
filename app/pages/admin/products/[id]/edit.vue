<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProductFormPayload } from '~/components/admin/ProductForm.vue'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const productId = computed(() => Number(route.params.id))

const { data: product, error: loadError } = useProductQuery(productId)
const { data: categoriesData } = useCategoriesQuery({ isActive: true, limit: 100 })
const categories = computed(() => categoriesData.value ?? [])

useHead({
  title: () => product.value
    ? t('admin.products.titleEdit') + ' — ' + product.value.name
    : t('admin.products.titleEdit'),
})

const updateMutation = useUpdateProduct()
const formError = ref<ProblemDetails | null>(null)

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
    formError.value = parseProblem(err)
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
          @click="navigateTo('/admin/products')"
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
          :product="product"
          :loading="updateMutation.isLoading.value"
          :error="formError"
          @submit="onSubmit"
          @cancel="navigateTo('/admin/products')"
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
      </template>
    </div>
  </NuxtLayout>
</template>
