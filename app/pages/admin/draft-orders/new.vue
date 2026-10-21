<script setup lang="ts">
import { z } from 'zod'
import type { DraftOrderCreate, DraftOrderCurrency } from '~/composables/queries/useDraftOrderQueries'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
useHead({ title: () => t('admin.draftOrders.create.title') })

const CURRENCIES: DraftOrderCurrency[] = ['USD', 'PLN', 'EUR']

const state = reactive({
  currency: 'USD' as DraftOrderCurrency,
  guestEmail: '',
  notes: '',
})

const schema = computed(() =>
  z.object({
    currency: z.enum(['USD', 'PLN', 'EUR']),
    guestEmail: z
      .string()
      .trim()
      .refine(
        v => v === '' || z.email().safeParse(v).success,
        t('admin.draftOrders.errors.invalidEmail'),
      ),
    notes: z.string(),
  }),
)

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

const createDraft = useCreateDraftOrder()

const currencyOptions = computed(() =>
  CURRENCIES.map(c => ({ label: c, value: c })),
)

async function onSubmit() {
  errorMessage.value = ''
  const body: DraftOrderCreate = {
    currency: state.currency,
    guest_email: state.guestEmail.trim() || null,
    notes: state.notes.trim() || null,
  }
  try {
    const draft = await createDraft.mutateAsync(body)
    toast.add({
      title: t('admin.draftOrders.flashes.created'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    await navigateTo(localePath(`/admin/draft-orders/${draft.id}`))
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-2xl">
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        :padded="false"
        :to="localePath('/admin/draft-orders')"
      >
        {{ $t('admin.draftOrders.actions.back') }}
      </UButton>

      <header>
        <h1 class="text-2xl font-bold">
          {{ $t('admin.draftOrders.create.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ $t('admin.draftOrders.create.subtitle') }}
        </p>
      </header>

      <UCard>
        <UForm
          ref="formRef"
          :schema="schema"
          :state="state"
          :validate-on="[]"
          class="space-y-6"
          data-testid="draft-order-form"
          @submit="onSubmit"
        >
          <UAlert
            v-if="errorMessage"
            role="alert"
            color="error"
            variant="soft"
            :title="t('messages.saveErrorTitle')"
            :description="errorMessage"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            data-testid="draft-order-form-validation"
            @close="errorMessage = ''"
          />

          <UFormField
            :label="t('admin.draftOrders.form.currency')"
            :help="t('admin.draftOrders.form.currencyHint')"
            name="currency"
            required
          >
            <USelect
              v-model="state.currency"
              :items="currencyOptions"
              value-key="value"
              class="w-full sm:w-40"
              data-testid="draft-order-currency"
            />
          </UFormField>

          <UFormField
            :label="t('admin.draftOrders.form.guestEmail')"
            :help="t('admin.draftOrders.form.guestEmailHint')"
            name="guestEmail"
          >
            <UInput
              v-model="state.guestEmail"
              type="email"
              class="w-full"
              data-testid="draft-order-guest-email"
            />
          </UFormField>

          <UFormField
            :label="t('admin.draftOrders.form.notes')"
            name="notes"
          >
            <UTextarea
              v-model="state.notes"
              :rows="3"
              class="w-full"
              data-testid="draft-order-notes"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :disabled="createDraft.isLoading.value"
              :to="localePath('/admin/draft-orders')"
            >
              {{ t('admin.draftOrders.form.cancel') }}
            </UButton>
            <UButton
              type="submit"
              color="primary"
              icon="i-lucide-save"
              :loading="createDraft.isLoading.value"
              data-testid="draft-order-form-submit"
            >
              {{ t('admin.draftOrders.form.create') }}
            </UButton>
          </div>
        </UForm>
      </UCard>
    </div>
  </NuxtLayout>
</template>
