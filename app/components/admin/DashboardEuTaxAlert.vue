<script setup lang="ts">
/**
 * Proactive EU distance-selling nudge for the admin dashboard. Auto-imports as
 * `<AdminDashboardEuTaxAlert>`. Reads the compact `eu_tax_liability` folded into
 * the KPIs payload and renders a banner ONLY when the store is approaching or has
 * crossed the €10 000 One-Stop-Shop threshold — so the merchant sees it on login
 * rather than having to open the reports page. Silent (renders nothing) when the
 * status is `not_approaching`. Full detail + progress lives on the reports page.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EuTaxLiability } from '#shared/types/api'

const props = defineProps<{
  liability: EuTaxLiability
}>()

const { t } = useI18n()
const localePath = useLocalePath()

const visible = computed(() => props.liability.status !== 'not_approaching')
const isMet = computed(() => props.liability.status === 'threshold_met')
const reportsLink = computed(() => localePath('/admin/reports'))
</script>

<template>
  <UAlert
    v-if="visible"
    data-testid="dashboard-eu-tax-alert"
    :color="isMet ? 'error' : 'warning'"
    variant="subtle"
    icon="i-lucide-landmark"
    :title="isMet
      ? t('admin.dashboardKpis.euTax.metTitle')
      : t('admin.dashboardKpis.euTax.approachingTitle')"
    :description="isMet
      ? t('admin.dashboardKpis.euTax.metBody', { year: liability.year })
      : t('admin.dashboardKpis.euTax.approachingBody', { year: liability.year })"
    :actions="[{
      label: t('admin.dashboardKpis.euTax.viewReport'),
      color: isMet ? 'error' : 'warning',
      variant: 'outline',
      to: reportsLink,
    }]"
  />
</template>
