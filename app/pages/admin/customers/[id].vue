<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'
import { formatMoney as formatMoneyIntl } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const route = useRoute()

const customerId = computed(() => {
  const raw = Number(route.params.id)
  return Number.isInteger(raw) && raw > 0 ? raw : undefined
})

const { data: customer, error: loadError, isLoading } = useCustomerQuery(customerId)

const updateMutation = useUpdateCustomer()
const unlockMutation = useUnlockCustomer()
const resetMutation = useSendCustomerPasswordReset()
const formError = ref<ProblemDetails | null>(null)

// The backend rejects an admin disabling/unverifying their own account; mirror
// that in the UI by disabling those actions when viewing yourself.
const isSelf = computed(() => !!customer.value && auth.user?.email === customer.value.email)
const busy = computed(() =>
  updateMutation.isLoading.value || unlockMutation.isLoading.value || resetMutation.isLoading.value,
)

const hasCompany = computed(() => !!customer.value?.company_name)

function formatMoney(amount: number, currency: string) {
  return formatMoneyIntl(amount, currency as CurrencyCode, 'en')
}
const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string | null | undefined) {
  return iso ? dateFmt.format(new Date(iso)) : '—'
}

async function runAction(fn: () => Promise<unknown>, successKey: string) {
  formError.value = null
  try {
    await fn()
    toast.add({ title: t(successKey), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}

function onToggleVerify() {
  if (!customer.value) return
  const next = !customer.value.is_verified
  void runAction(
    () => updateMutation.mutateAsync({ id: customer.value!.id, patch: { is_verified: next } }),
    next ? 'admin.customers.flashes.verified' : 'admin.customers.flashes.unverified',
  )
}

function onToggleActive() {
  if (!customer.value) return
  const next = !customer.value.is_active
  void runAction(
    () => updateMutation.mutateAsync({ id: customer.value!.id, patch: { is_active: next } }),
    next ? 'admin.customers.flashes.enabled' : 'admin.customers.flashes.disabled',
  )
}

function onUnlock() {
  if (!customer.value) return
  void runAction(
    () => unlockMutation.mutateAsync(customer.value!.id),
    'admin.customers.flashes.unlocked',
  )
}

function onSendReset() {
  if (!customer.value) return
  void runAction(
    () => resetMutation.mutateAsync(customer.value!.id),
    'admin.customers.flashes.resetSent',
  )
}

const startingImpersonation = ref(false)

async function onImpersonate() {
  if (!customer.value) return
  startingImpersonation.value = true
  formError.value = null
  try {
    const res = await auth.startImpersonation(customer.value.id)
    if (res.success) {
      await navigateTo('/account')
    }
    else {
      toast.add({ title: res.error, color: 'error', icon: 'i-lucide-triangle-alert' })
    }
  }
  finally {
    startingImpersonation.value = false
  }
}

useHead({ title: () => t('admin.customers.detail.title', { email: customer.value?.email ?? '' }) })
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6 max-w-4xl">
      <UButton
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        :padded="false"
        @click="navigateTo('/admin/customers')"
      >
        {{ $t('admin.customers.actions.back') }}
      </UButton>

      <div
        v-if="isLoading"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.customers.detail.loading') }}
      </div>

      <ErrorAlert
        v-else-if="loadError"
        :problem="parseProblem(loadError)"
      />

      <template v-else-if="customer">
        <header class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-2xl font-bold">
              {{ customer.first_name }} {{ customer.last_name }}
            </h1>
            <p class="text-muted text-sm mt-1">
              {{ customer.email }}
            </p>
          </div>
          <div class="flex flex-wrap gap-1">
            <UBadge
              :color="customer.role === 'ADMIN' ? 'primary' : 'neutral'"
              variant="subtle"
            >
              {{ $t(`admin.customers.roles.${customer.role}`) }}
            </UBadge>
            <UBadge
              :color="customer.is_active ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ customer.is_active
                ? $t('admin.customers.status.active')
                : $t('admin.customers.status.inactive') }}
            </UBadge>
            <UBadge
              v-if="!customer.is_verified"
              color="warning"
              variant="subtle"
            >
              {{ $t('admin.customers.status.unverified') }}
            </UBadge>
            <UBadge
              v-if="customer.is_locked"
              color="error"
              variant="subtle"
            >
              {{ $t('admin.customers.status.locked') }}
            </UBadge>
          </div>
        </header>

        <!-- Lifetime metrics -->
        <div class="grid gap-4 sm:grid-cols-3">
          <UCard>
            <div class="text-muted text-xs uppercase tracking-wide">
              {{ $t('admin.customers.metrics.orders') }}
            </div>
            <div class="text-2xl font-bold mt-1">
              {{ customer.metrics.order_count }}
            </div>
          </UCard>
          <UCard>
            <div class="text-muted text-xs uppercase tracking-wide">
              {{ $t('admin.customers.metrics.spent') }}
            </div>
            <div class="mt-1 space-y-0.5">
              <div
                v-for="(amount, currency) in customer.metrics.total_spent"
                :key="currency"
                class="font-semibold"
              >
                {{ formatMoney(amount, currency) }}
              </div>
              <div
                v-if="Object.keys(customer.metrics.total_spent).length === 0"
                class="text-muted"
              >
                —
              </div>
            </div>
          </UCard>
          <UCard>
            <div class="text-muted text-xs uppercase tracking-wide">
              {{ $t('admin.customers.metrics.lastOrder') }}
            </div>
            <div class="text-sm mt-1">
              {{ formatDate(customer.metrics.last_order_at) }}
            </div>
          </UCard>
        </div>

        <div class="grid gap-6 md:grid-cols-2">
          <!-- Profile -->
          <UCard>
            <template #header>
              <h2 class="font-semibold">
                {{ $t('admin.customers.detail.profile') }}
              </h2>
            </template>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ $t('admin.customers.detail.phone') }}
                </dt>
                <dd>{{ customer.phone ?? '—' }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-muted">
                  {{ $t('admin.customers.detail.joined') }}
                </dt>
                <dd>{{ formatDate(customer.created_at) }}</dd>
              </div>
            </dl>
          </UCard>
        </div>

        <!-- Company (B2B) -->
        <UCard v-if="hasCompany">
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.customers.detail.company') }}
            </h2>
          </template>
          <dl class="space-y-1 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.customers.detail.companyName') }}
              </dt>
              <dd>{{ customer.company_name }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                {{ $t('admin.customers.detail.taxId') }}
              </dt>
              <dd>{{ customer.company_tax_id ?? '—' }}</dd>
            </div>
          </dl>
        </UCard>

        <!-- Tags -->
        <AdminCustomerTags
          :customer-id="customer.id"
          :tags="customer.tags ?? []"
        />

        <!-- Internal notes -->
        <AdminCustomerNotes :customer-id="customer.id" />

        <!-- Actions -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              {{ $t('admin.customers.detail.manage') }}
            </h2>
          </template>

          <ErrorAlert
            v-if="formError"
            :problem="formError"
            class="mb-4"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              :color="customer.is_verified ? 'warning' : 'primary'"
              variant="soft"
              :icon="customer.is_verified ? 'i-lucide-shield-off' : 'i-lucide-shield-check'"
              :disabled="busy || (customer.is_verified && isSelf)"
              @click="onToggleVerify"
            >
              {{ customer.is_verified
                ? $t('admin.customers.actions.unverify')
                : $t('admin.customers.actions.verify') }}
            </UButton>
            <UButton
              :color="customer.is_active ? 'error' : 'success'"
              variant="soft"
              :icon="customer.is_active ? 'i-lucide-user-x' : 'i-lucide-user-check'"
              :disabled="busy || (customer.is_active && isSelf)"
              @click="onToggleActive"
            >
              {{ customer.is_active
                ? $t('admin.customers.actions.disable')
                : $t('admin.customers.actions.enable') }}
            </UButton>
            <UButton
              v-if="customer.is_locked"
              color="neutral"
              variant="soft"
              icon="i-lucide-lock-open"
              :disabled="busy"
              @click="onUnlock"
            >
              {{ $t('admin.customers.actions.unlock') }}
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-mail"
              :disabled="busy"
              @click="onSendReset"
            >
              {{ $t('admin.customers.actions.sendReset') }}
            </UButton>
            <UButton
              v-if="customer.role !== 'ADMIN'"
              color="neutral"
              variant="soft"
              icon="i-lucide-eye"
              :loading="startingImpersonation"
              :disabled="busy || !customer.is_active || isSelf"
              @click="onImpersonate"
            >
              {{ $t('admin.customers.actions.impersonate') }}
            </UButton>
          </div>
          <p
            v-if="isSelf"
            class="text-muted text-xs mt-3"
          >
            {{ $t('admin.customers.detail.selfHint') }}
          </p>
        </UCard>
      </template>
    </div>
  </NuxtLayout>
</template>
