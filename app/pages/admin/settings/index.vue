<script setup lang="ts">
import type { StoreConfigUpdate } from '~/composables/queries/useSettingsQueries'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.pages.settings.title') })

const { data: config, error: loadError, isLoading } = useStoreConfigQuery()
const updateConfig = useUpdateStoreConfig()
const toast = useToast()

// Surface either the GET error (page load) or the PATCH error (save) in the
// form's ErrorAlert. A 422 from the VAT bound lands here.
const saveError = ref<ProblemDetails | null>(null)
const formError = computed<ProblemDetails | null>(
  () => saveError.value ?? parseProblem(loadError.value),
)

async function onSubmit(patch: StoreConfigUpdate) {
  saveError.value = null
  try {
    await updateConfig.mutateAsync(patch)
    toast.add({
      title: t('admin.settings.flashes.saved'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    saveError.value = parseProblem(err)
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-admin-page max-w-3xl space-y-6">
      <header>
        <h1 class="text-2xl font-bold">
          {{ $t('admin.settings.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ $t('admin.settings.subtitle') }}
        </p>
      </header>

      <AdminSettingsForm
        :config="config"
        :loading="isLoading || updateConfig.isLoading.value"
        :error="formError"
        @submit="onSubmit"
      />
    </div>
  </NuxtLayout>
</template>
