<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CompanyMe } from '~/composables/queries/useCompany'

/**
 * Read-only company-profile view for BUYER / VIEWER members (D-D-6: only
 * COMPANY_ADMIN may edit). A labelled definition list; empty fields render an
 * em-dash so the layout is stable.
 */

const props = defineProps<{
  company: CompanyMe
}>()

const { t } = useI18n()

interface Row {
  key: string
  value: string | null | undefined
}

const rows = computed<Row[]>(() => [
  { key: 'taxId', value: props.company.tax_id },
  { key: 'regon', value: props.company.regon },
  { key: 'email', value: props.company.email },
  { key: 'phone', value: props.company.phone },
  { key: 'street', value: props.company.billing_address_street },
  { key: 'city', value: props.company.billing_address_city },
  { key: 'postalCode', value: props.company.billing_address_postal_code },
  { key: 'country', value: props.company.billing_address_country },
  { key: 'state', value: props.company.billing_address_state },
  { key: 'defaultCurrency', value: props.company.default_currency },
])
</script>

<template>
  <dl class="c-company-profile-view grid gap-x-6 gap-y-4 sm:grid-cols-2">
    <div
      v-for="row in rows"
      :key="row.key"
      class="flex flex-col"
    >
      <dt class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t(`account.settings.company.fields.${row.key}`) }}
      </dt>
      <dd class="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
        {{ row.value || '—' }}
      </dd>
    </div>
  </dl>
</template>
