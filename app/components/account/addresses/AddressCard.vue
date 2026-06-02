<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { countryName } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'
import type { Address } from '~/composables/queries/useAddresses'

/**
 * A single saved address rendered as a card. Stateless + parent-driven: it shows
 * the address, badges the default-shipping / default-billing roles, and emits
 * `edit`, `delete` and `set-default-shipping` / `set-default-billing` so the page
 * can drive the mutations + confirm modal.
 */

const props = defineProps<{
  address: Address
  busy?: boolean
}>()

const emit = defineEmits<{
  'edit': [address: Address]
  'delete': [address: Address]
  'set-default-shipping': [address: Address]
  'set-default-billing': [address: Address]
}>()

const { t, locale } = useI18n()

const countryLabel = computed(() =>
  countryName(props.address.country, locale.value as SupportedLocale),
)
</script>

<template>
  <div class="c-address-card rounded-lg border border-gray-200 p-4 dark:border-gray-800">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="font-semibold">
            {{ address.label || address.recipient_name }}
          </h3>
          <UBadge
            v-if="address.is_default_shipping"
            color="primary"
            variant="subtle"
            size="sm"
          >
            {{ t('account.settings.addresses.card.defaultShipping') }}
          </UBadge>
          <UBadge
            v-if="address.is_default_billing"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            {{ t('account.settings.addresses.card.defaultBilling') }}
          </UBadge>
        </div>
        <address class="mt-1 text-sm not-italic text-gray-600 dark:text-gray-400">
          <span class="block">{{ address.recipient_name }}</span>
          <span class="block">{{ address.street }}</span>
          <span class="block">
            {{ address.postal_code }} {{ address.city }}
            <template v-if="address.state">, {{ address.state }}</template>
          </span>
          <span class="block">{{ countryLabel }}</span>
          <span
            v-if="address.phone"
            class="block"
          >{{ address.phone }}</span>
        </address>
      </div>

      <div class="flex shrink-0 gap-1">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-pencil"
          :aria-label="t('account.settings.addresses.card.edit')"
          :disabled="busy"
          @click="emit('edit', address)"
        />
        <UButton
          color="error"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          :aria-label="t('account.settings.addresses.card.delete')"
          :disabled="busy"
          @click="emit('delete', address)"
        />
      </div>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <UButton
        v-if="!address.is_default_shipping"
        color="primary"
        variant="link"
        size="xs"
        :padded="false"
        :disabled="busy"
        @click="emit('set-default-shipping', address)"
      >
        {{ t('account.settings.addresses.card.makeDefaultShipping') }}
      </UButton>
      <UButton
        v-if="!address.is_default_billing"
        color="primary"
        variant="link"
        size="xs"
        :padded="false"
        :disabled="busy"
        @click="emit('set-default-billing', address)"
      >
        {{ t('account.settings.addresses.card.makeDefaultBilling') }}
      </UButton>
    </div>
  </div>
</template>
