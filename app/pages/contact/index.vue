<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { components } from '#shared/types/api.gen'
import { createContactSchema, type ContactFormData } from '#shared/validators/contact'
import { narrowFetchError } from '~/utils/apiError'

const { t } = useI18n()
const toast = useToast()
const { apiFetch } = useApi()

useSeoMeta({
  title: () => t('legal.contact.meta.title'),
  description: () => t('legal.contact.meta.description'),
})

const state = reactive<ContactFormData>({
  name: '',
  email: '',
  subject: '',
  message: '',
})

const schema = computed(() => createContactSchema(t))

function validate(values: ContactFormData): FormError[] {
  const result = schema.value.safeParse(values)
  if (result.success) return []
  return result.error.issues.map(issue => ({
    name: String(issue.path[0] ?? ''),
    message: issue.message,
  }))
}

const sending = ref(false)

async function onSubmit(event: FormSubmitEvent<ContactFormData>) {
  sending.value = true
  try {
    await apiFetch<components['schemas']['ContactResponse']>('/api/v1/contact', {
      method: 'POST',
      body: {
        name: event.data.name.trim(),
        email: event.data.email.trim(),
        subject: event.data.subject.trim(),
        message: event.data.message.trim(),
      } satisfies components['schemas']['ContactRequest'],
    })

    toast.add({
      title: t('legal.contact.form.successTitle'),
      description: t('legal.contact.form.successDescription'),
      color: 'success',
      icon: 'i-lucide-check-circle',
    })

    state.name = ''
    state.email = ''
    state.subject = ''
    state.message = ''
  }
  catch (error) {
    narrowFetchError(error)
    toast.add({
      title: t('legal.contact.form.errorTitle'),
      description: t('legal.contact.form.errorDescription'),
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <UContainer class="c-contact-page py-12 md:py-16">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-3xl font-bold mb-4">
        {{ t('legal.contact.title') }}
      </h1>

      <UAlert
        class="mb-8"
        color="warning"
        variant="soft"
        icon="i-lucide-info"
        :title="t('legal.draftNotice.title')"
        :description="t('legal.draftNotice.body')"
      />

      <p class="text-lg text-muted mb-8">
        {{ t('legal.contact.intro') }}
      </p>

      <div class="grid gap-8 md:grid-cols-5">
        <aside class="md:col-span-2">
          <h2 class="text-lg font-semibold mb-4">
            {{ t('legal.contact.details.heading') }}
          </h2>
          <dl class="space-y-4 text-sm">
            <div>
              <dt class="text-muted">
                {{ t('legal.contact.details.emailLabel') }}
              </dt>
              <dd class="font-medium">
                {{ t('legal.contact.details.email') }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                {{ t('legal.contact.details.phoneLabel') }}
              </dt>
              <dd class="font-medium">
                {{ t('legal.contact.details.phone') }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                {{ t('legal.contact.details.addressLabel') }}
              </dt>
              <dd class="font-medium">
                {{ t('legal.contact.details.address') }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                {{ t('legal.contact.details.hoursLabel') }}
              </dt>
              <dd class="font-medium">
                {{ t('legal.contact.details.hours') }}
              </dd>
            </div>
          </dl>
        </aside>

        <div class="md:col-span-3">
          <UCard>
            <h2 class="text-lg font-semibold mb-4">
              {{ t('legal.contact.form.heading') }}
            </h2>
            <UForm
              :state="state"
              :validate="validate"
              :validate-on="['submit']"
              class="space-y-5"
              @submit="onSubmit"
            >
              <UFormField
                :label="t('legal.contact.form.name')"
                name="name"
                required
              >
                <UInput
                  v-model="state.name"
                  :placeholder="t('legal.contact.form.namePlaceholder')"
                  autocomplete="name"
                  :disabled="sending"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('legal.contact.form.email')"
                name="email"
                required
              >
                <UInput
                  v-model="state.email"
                  type="email"
                  :placeholder="t('legal.contact.form.emailPlaceholder')"
                  autocomplete="email"
                  :disabled="sending"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('legal.contact.form.subject')"
                name="subject"
                required
              >
                <UInput
                  v-model="state.subject"
                  :placeholder="t('legal.contact.form.subjectPlaceholder')"
                  :disabled="sending"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="t('legal.contact.form.message')"
                name="message"
                required
              >
                <UTextarea
                  v-model="state.message"
                  :placeholder="t('legal.contact.form.messagePlaceholder')"
                  :rows="6"
                  :disabled="sending"
                  class="w-full"
                />
              </UFormField>

              <div class="flex justify-end">
                <UButton
                  type="submit"
                  color="primary"
                  :loading="sending"
                >
                  {{ sending ? t('legal.contact.form.sending') : t('legal.contact.form.submit') }}
                </UButton>
              </div>
            </UForm>
          </UCard>
        </div>
      </div>
    </div>
  </UContainer>
</template>
