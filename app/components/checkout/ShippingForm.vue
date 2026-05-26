<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createShippingSchema } from '#shared/validators/checkout'
import type { ShippingInput } from '#shared/validators/checkout'
import type { ProblemDetails } from '#shared/utils/problemDetails'

const props = defineProps<{
  initial?: Partial<ShippingInput>
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{ submit: [values: ShippingInput] }>()

const { t } = useI18n()
const schema = computed(() => createShippingSchema(t))

const state = reactive<ShippingInput>({
  address: props.initial?.address ?? '',
  city: props.initial?.city ?? '',
  postalCode: props.initial?.postalCode ?? '',
  country: props.initial?.country ?? '',
  notes: props.initial?.notes ?? '',
})

// Profile may resolve after mount; backfill empty fields from the prefill once.
watch(() => props.initial, (incoming) => {
  if (!incoming) return
  if (!state.address && incoming.address) state.address = incoming.address
  if (!state.city && incoming.city) state.city = incoming.city
  if (!state.postalCode && incoming.postalCode) state.postalCode = incoming.postalCode
  if (!state.country && incoming.country) state.country = incoming.country
})

function onSubmit(event: { data: ShippingInput }) {
  emit('submit', event.data)
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    :validate-on="['submit']"
    class="space-y-4"
    @submit="onSubmit"
  >
    <ErrorAlert
      v-if="error"
      :problem="error"
    />

    <UFormField
      :label="t('checkout.shipping.address')"
      name="address"
      required
    >
      <UInput
        v-model="state.address"
        class="w-full"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('checkout.shipping.city')"
        name="city"
        required
      >
        <UInput
          v-model="state.city"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('checkout.shipping.postalCode')"
        name="postalCode"
        required
      >
        <UInput
          v-model="state.postalCode"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      :label="t('checkout.shipping.country')"
      name="country"
      required
    >
      <UInput
        v-model="state.country"
        class="w-full"
      />
    </UFormField>

    <UFormField
      :label="t('checkout.shipping.notes')"
      name="notes"
    >
      <UTextarea
        v-model="state.notes"
        :placeholder="t('checkout.shipping.notesPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UButton
      type="submit"
      color="primary"
      block
      :loading="loading"
    >
      {{ t('checkout.placeOrder') }}
    </UButton>
  </UForm>
</template>
