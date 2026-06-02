<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { countryName } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'
import type { Address } from '~/composables/queries/useAddresses'

/**
 * Saved-address picker for checkout. Lets a returning customer prefill the
 * shipping form from one of their saved addresses instead of retyping it. The
 * v-model is the chosen address id (or `null` for "enter a new address"). The
 * parent (checkout page) owns the actual prefill — it resolves the selected id
 * back to the address and feeds it to the shipping form's `initial` prop.
 *
 * Renders nothing when there are no saved addresses, so guests / first-time
 * buyers see the plain form untouched.
 */

const props = defineProps<{
  addresses: Address[]
  modelValue: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [id: number | null]
}>()

const { t, locale } = useI18n()

const NEW_VALUE = '__new__'

function summary(address: Address): string {
  const country = countryName(address.country, locale.value as SupportedLocale)
  const head = address.label || address.recipient_name
  return `${head} — ${address.street}, ${address.postal_code} ${address.city}, ${country}`
}

const items = computed(() => [
  ...props.addresses.map(a => ({ label: summary(a), value: String(a.id) })),
  { label: t('checkout.address.enterNew'), value: NEW_VALUE },
])

const selected = computed<string>(() =>
  props.modelValue == null ? NEW_VALUE : String(props.modelValue),
)

function onChange(value: unknown) {
  const v = value as string
  emit('update:modelValue', v === NEW_VALUE ? null : Number(v))
}
</script>

<template>
  <div
    v-if="addresses.length > 0"
    class="c-address-picker"
  >
    <UFormField
      :label="t('checkout.address.savedLabel')"
      :description="t('checkout.address.savedHint')"
    >
      <USelect
        :model-value="selected"
        :items="items"
        value-key="value"
        :aria-label="t('checkout.address.savedLabel')"
        class="w-full"
        @update:model-value="onChange"
      />
    </UFormField>
  </div>
</template>
