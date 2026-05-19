<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProductFormPayload } from '~/components/admin/ProductForm.vue'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.products.titleNew') })

const { data: categoriesData } = useCategoriesQuery({ isActive: true, limit: 100 })
const categories = computed(() => categoriesData.value ?? [])

const createMutation = useCreateProduct()
const formError = ref<ProblemDetails | null>(null)

async function onSubmit(payload: ProductFormPayload) {
  formError.value = null
  try {
    const created = await createMutation.mutateAsync(payload)
    await navigateTo({
      path: `/admin/products/${created.id}/edit`,
      query: { created: '1' },
    })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}
</script>

<template>
  <div class="space-y-6 max-w-4xl">
    <header class="flex items-center gap-3">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
        :aria-label="$t('admin.products.actions.backToList')"
        @click="navigateTo('/admin/products')"
      />
      <div>
        <h1 class="text-2xl font-bold">
          {{ $t('admin.products.titleNew') }}
        </h1>
        <p class="text-muted text-sm">
          {{ $t('admin.products.subtitle') }}
        </p>
      </div>
    </header>

    <AdminProductForm
      :categories="categories"
      :loading="createMutation.isLoading.value"
      :error="formError"
      :submit-label="$t('admin.products.actions.saveAndContinue')"
      @submit="onSubmit"
      @cancel="navigateTo('/admin/products')"
    />
  </div>
</template>
