<script setup lang="ts">
import type { ProductFormPayload } from '~/components/admin/ProductForm.vue'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const localePath = useLocalePath()
useHead({ title: () => t('admin.products.titleNew') })

const { data: categoriesData } = useCategoriesQuery({ isActive: true, limit: 100 })
const categories = computed(() => categoriesData.value ?? [])

const createMutation = useCreateProduct()
const uploadMutation = useUploadProductImage()
const setPrimaryMutation = useUpdateProductImage()
const deleteMutation = useDeleteProduct()

const stagedFiles = ref<File[]>([])
const isSubmitting = ref(false)
const formError = ref<unknown>(null)

async function onSubmit(payload: ProductFormPayload) {
  formError.value = null
  isSubmitting.value = true
  let createdId: number | null = null
  try {
    const created = await createMutation.mutateAsync(payload)
    createdId = created.id

    let firstImageId: number | null = null
    for (const file of stagedFiles.value) {
      const formData = new FormData()
      formData.append('file', file)
      const uploaded = await uploadMutation.mutateAsync({
        productId: created.id,
        formData,
      })
      if (firstImageId === null) firstImageId = uploaded.id
    }

    if (firstImageId !== null) {
      await setPrimaryMutation.mutateAsync({
        productId: created.id,
        imageId: firstImageId,
        patch: { is_primary: true },
      })
    }

    await navigateTo(localePath({
      path: `/admin/products/${created.id}/edit`,
      query: { created: '1' },
    }))
  }
  catch (err) {
    if (createdId !== null) {
      try {
        await deleteMutation.mutateAsync(createdId)
      }
      catch {
        // Best-effort cleanup; orphan product is recoverable from /admin/products.
      }
    }
    formError.value = err
  }
  finally {
    isSubmitting.value = false
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
        :loading="isSubmitting"
        :error="formError"
        :submit-label="$t('admin.products.actions.saveAndContinue')"
        @submit="onSubmit"
        @cancel="navigateTo(localePath('/admin/products'))"
      >
        <template #extra-sections>
          <section class="space-y-4">
            <h2 class="text-lg font-semibold">
              {{ $t('admin.products.sections.media') }}
            </h2>
            <AdminProductImageStaging
              :disabled="isSubmitting"
              @update:files="(files: File[]) => stagedFiles = files"
            />
          </section>
        </template>
      </AdminProductForm>
    </div>
  </NuxtLayout>
</template>
