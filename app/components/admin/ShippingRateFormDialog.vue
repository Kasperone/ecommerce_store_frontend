<script setup lang="ts">
/**
 * Create/edit a shipping rate (admin).
 *
 * The rate row carries three pricing shapes (mirrors the backend
 * `ShippingRate` model):
 *   - `amount` (required, base/fallback)
 *   - `free_above_subtotal` (optional, zero-out trigger)
 *   - `tiers` (optional JSONB list of subtotal bands)
 *
 * Most admins only ever fill `amount` + maybe `free_above_subtotal`. The
 * tiers UI hides behind a collapsed `<details>` "Configure subtotal tiers"
 * expander so the dialog stays glanceable. A small "preview" line at the
 * bottom shows the resolved shipping for a probe subtotal — the admin types
 * a cart subtotal and sees the exact same price the backend would charge
 * (uses the shared `applyShippingRate` TS port).
 *
 * The (zone, method, currency) UNIQUE-constraint conflict 400s on the wire;
 * the inline `<ErrorAlert>` surfaces the existing-combo message.
 */

import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '#shared/utils/money'
import { applyShippingRate } from '#shared/utils/shippingRate'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type {
  ShippingMethodResponse,
  ShippingRateListItem,
  ShippingZoneListItem,
} from '#shared/types/api'
import type { ShippingCurrency } from '~/composables/queries/useShippingQueries'

const props = defineProps<{
  open: boolean
  /** Existing rate for edit; null for create. */
  rate?: ShippingRateListItem | null
  /** Available zones for the zone <USelect>. */
  zones: ShippingZoneListItem[]
  /** Available methods for the method <USelect>. */
  methods: ShippingMethodResponse[]
  /** Pre-fills (zone, method, currency) on create when launched from a matrix-cell click. */
  presetCombo?: { zoneId?: number, methodId?: number, currency?: ShippingCurrency }
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t, locale } = useI18n()
const toast = useToast()
const create = useCreateShippingRate()
const update = useUpdateShippingRate()

const mode = computed<'create' | 'edit'>(() => (props.rate ? 'edit' : 'create'))
const loading = computed(() => create.isLoading.value || update.isLoading.value)

const CURRENCIES: { value: ShippingCurrency, label: string }[] = [
  { value: 'USD', label: 'USD' },
  { value: 'PLN', label: 'PLN' },
  { value: 'EUR', label: 'EUR' },
]

const state = reactive({
  zone_id: null as number | null,
  method_id: null as number | null,
  currency: 'USD' as ShippingCurrency,
  amount: 0,
  free_above_subtotal: null as number | null,
  // Tiers are edited as a dynamic list; on submit `[]` collapses to `null`.
  tiers: [] as { min_subtotal: number, amount: number }[],
})
const tiersExpanded = ref(false)
const previewSubtotal = ref(0)
const error = ref<ProblemDetails | null>(null)

const zoneOptions = computed(() => props.zones.map(z => ({ value: z.id, label: z.name })))
const methodOptions = computed(() => props.methods.map(m => ({ value: m.id, label: m.name })))

// Resolved shipping for the probe subtotal — same precedence as the backend.
const previewAmount = computed(() =>
  applyShippingRate(
    {
      amount: state.amount,
      free_above_subtotal: state.free_above_subtotal,
      tiers: state.tiers.length > 0 ? state.tiers : null,
    },
    previewSubtotal.value,
  ),
)
const previewFormatted = computed(() =>
  formatMoney(previewAmount.value, state.currency, locale.value),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    tiersExpanded.value = false
    previewSubtotal.value = 0
    if (props.rate) {
      state.zone_id = props.rate.zone_id
      state.method_id = props.rate.method_id
      state.currency = props.rate.currency as ShippingCurrency
      state.amount = props.rate.amount
      state.free_above_subtotal = props.rate.free_above_subtotal
      state.tiers = (props.rate.tiers ?? []).map(t => ({
        min_subtotal: t.min_subtotal,
        amount: t.amount,
      }))
      tiersExpanded.value = state.tiers.length > 0
    }
    else {
      state.zone_id = props.presetCombo?.zoneId ?? null
      state.method_id = props.presetCombo?.methodId ?? null
      state.currency = props.presetCombo?.currency ?? 'USD'
      state.amount = 0
      state.free_above_subtotal = null
      state.tiers = []
    }
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function addTier() {
  // Default the new band to "above the highest existing one"; admin tweaks.
  const lastMin = state.tiers.reduce((m, b) => Math.max(m, b.min_subtotal), 0)
  state.tiers.push({ min_subtotal: lastMin + 100, amount: state.amount })
}

function removeTier(index: number) {
  state.tiers.splice(index, 1)
}

function clearFreeAbove() {
  state.free_above_subtotal = null
}

const submitDisabled = computed(
  () => state.zone_id === null || state.method_id === null || state.amount < 0,
)

async function onSubmit() {
  if (submitDisabled.value) return
  error.value = null

  // Tiers normalised: drop empties + sort ascending. Backend does its own
  // canonicalisation but we send a clean payload so the admin sees the same
  // order back from a refetch.
  const tiers = state.tiers
    .filter(t => Number.isFinite(t.min_subtotal) && Number.isFinite(t.amount))
    .sort((a, b) => a.min_subtotal - b.min_subtotal)

  try {
    if (props.rate) {
      await update.mutateAsync({
        id: props.rate.id,
        patch: {
          currency: state.currency,
          amount: state.amount,
          free_above_subtotal: state.free_above_subtotal,
          tiers: tiers.length > 0 ? tiers : null,
        },
      })
      toast.add({ title: t('admin.shipping.flashes.rateUpdated') })
    }
    else {
      await create.mutateAsync({
        zone_id: state.zone_id!,
        method_id: state.method_id!,
        currency: state.currency,
        amount: state.amount,
        free_above_subtotal: state.free_above_subtotal,
        tiers: tiers.length > 0 ? tiers : null,
      })
      toast.add({ title: t('admin.shipping.flashes.rateCreated') })
    }
    emit('saved')
    emit('update:open', false)
  }
  catch (err) {
    error.value = parseProblem(err)
  }
}
</script>

<template>
  <UModal v-model:open="openModel">
    <template #content>
      <UCard>
        <template #header>
          <h2 class="text-base font-semibold">
            {{ mode === 'edit' ? t('admin.shipping.rates.edit') : t('admin.shipping.rates.create') }}
          </h2>
        </template>

        <form
          class="space-y-4"
          @submit.prevent="onSubmit"
        >
          <ErrorAlert
            v-if="error"
            :problem="error"
          />

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              :label="t('admin.shipping.rates.zone')"
              required
            >
              <USelectMenu
                v-model="state.zone_id"
                :items="zoneOptions"
                value-key="value"
                :placeholder="t('admin.shipping.rates.zonePlaceholder')"
                :disabled="mode === 'edit'"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.shipping.rates.method')"
              required
            >
              <USelectMenu
                v-model="state.method_id"
                :items="methodOptions"
                value-key="value"
                :placeholder="t('admin.shipping.rates.methodPlaceholder')"
                :disabled="mode === 'edit'"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.shipping.rates.currency')"
              required
            >
              <USelect
                v-model="state.currency"
                :items="CURRENCIES"
                value-key="value"
                :disabled="mode === 'edit'"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            :label="t('admin.shipping.rates.amount')"
            :hint="t('admin.shipping.rates.amountHint')"
            required
          >
            <UInputNumber
              v-model="state.amount"
              :min="0"
              :step="0.01"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.shipping.rates.freeAbove')"
            :hint="t('admin.shipping.rates.freeAboveHint')"
          >
            <div class="flex items-center gap-2">
              <UInputNumber
                v-model.number="state.free_above_subtotal"
                :min="0"
                :step="0.01"
                class="flex-1"
              />
              <UButton
                v-if="state.free_above_subtotal !== null"
                variant="ghost"
                size="sm"
                icon="i-lucide-x"
                :aria-label="t('admin.shipping.rates.clearFreeAbove')"
                @click="clearFreeAbove"
              />
            </div>
          </UFormField>

          <details
            class="rounded-md border border-gray-200 p-3 dark:border-gray-800"
            :open="tiersExpanded"
            @toggle="tiersExpanded = ($event.target as HTMLDetailsElement).open"
          >
            <summary class="cursor-pointer text-sm font-medium">
              {{ t('admin.shipping.rates.tiers.title') }}
              <span class="ml-1 text-xs text-muted">
                ({{ state.tiers.length }})
              </span>
            </summary>
            <div class="mt-3 space-y-2">
              <p class="text-xs text-muted">
                {{ t('admin.shipping.rates.tiers.hint') }}
              </p>
              <div
                v-for="(tier, idx) in state.tiers"
                :key="idx"
                class="flex items-center gap-2"
              >
                <UInputNumber
                  v-model="tier.min_subtotal"
                  :min="0"
                  :step="0.01"
                  :placeholder="t('admin.shipping.rates.tiers.minSubtotal')"
                  class="flex-1"
                />
                <span class="text-muted">→</span>
                <UInputNumber
                  v-model="tier.amount"
                  :min="0"
                  :step="0.01"
                  :placeholder="t('admin.shipping.rates.tiers.amount')"
                  class="flex-1"
                />
                <UButton
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-trash-2"
                  color="error"
                  :aria-label="t('admin.shipping.rates.tiers.remove')"
                  @click="removeTier(idx)"
                />
              </div>
              <UButton
                variant="outline"
                size="sm"
                icon="i-lucide-plus"
                @click="addTier"
              >
                {{ t('admin.shipping.rates.tiers.add') }}
              </UButton>
            </div>
          </details>

          <div class="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              {{ t('admin.shipping.rates.preview.title') }}
            </p>
            <div class="flex items-center gap-2">
              <span class="text-muted">{{ t('admin.shipping.rates.preview.subtotal') }}:</span>
              <UInputNumber
                v-model="previewSubtotal"
                :min="0"
                :step="0.01"
                class="flex-1"
              />
              <span class="text-muted">→</span>
              <span class="font-semibold">{{ previewFormatted }}</span>
            </div>
          </div>
        </form>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              :disabled="loading"
              @click="emit('update:open', false)"
            >
              {{ t('actions.cancel') }}
            </UButton>
            <UButton
              color="primary"
              :loading="loading"
              :disabled="submitDisabled"
              @click="onSubmit"
            >
              {{ t('actions.save') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
