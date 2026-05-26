<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CurrencyCode } from '#shared/utils/money'

const { t } = useI18n()
const { currency, setCurrency, currencies } = useCurrencyPreference()

const items = computed(() => currencies.map(c => ({ label: c.code, value: c.code })))
</script>

<template>
  <USelectMenu
    :model-value="currency"
    :items="items"
    value-key="value"
    :aria-label="t('currency.select')"
    :search-input="false"
    class="w-24"
    @update:model-value="(v) => setCurrency(v as CurrencyCode)"
  />
</template>
