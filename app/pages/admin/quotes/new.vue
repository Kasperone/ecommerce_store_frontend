<script setup lang="ts">
import type { QuoteCreate } from '~/composables/queries/useQuoteQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
useHead({ title: () => t('admin.quotes.create.title') })

const { data: companiesData, error: companiesError } = useQuoteCompaniesQuery()
const companies = computed(() => companiesData.value?.items ?? [])

const createQuote = useCreateQuote()
const formError = ref<unknown>(null)

async function onSubmit(body: QuoteCreate) {
  formError.value = null
  try {
    const quote = await createQuote.mutateAsync(body)
    toast.add({
      title: t('admin.quotes.flashes.created'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    await navigateTo(localePath(`/admin/quotes/${quote.id}`))
  }
  catch (err) {
    // 404 (unknown company) / 422 (empty items) both surface in the form.
    formError.value = err
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-4xl">
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        :padded="false"
        @click="navigateTo(localePath('/admin/quotes'))"
      >
        {{ $t('admin.quotes.actions.back') }}
      </UButton>

      <header>
        <h1 class="text-2xl font-bold">
          {{ $t('admin.quotes.create.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ $t('admin.quotes.create.subtitle') }}
        </p>
      </header>

      <ErrorAlert
        v-if="companiesError"
        :problem="parseProblem(companiesError)"
      />

      <UCard>
        <AdminQuoteForm
          :companies="companies"
          :loading="createQuote.isLoading.value"
          :error="formError"
          @submit="onSubmit"
          @cancel="navigateTo(localePath('/admin/quotes'))"
        />
      </UCard>
    </div>
  </NuxtLayout>
</template>
