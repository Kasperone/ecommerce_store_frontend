<script setup lang="ts">
import { z } from 'zod'
import type {
  CouponCreate,
  CouponCurrency,
  CouponDiscountType,
  CouponResponse,
  CouponUpdate,
} from '~/composables/queries/useCouponQueries'

/**
 * Create / edit a coupon.
 *
 * `coupon === null` ⇒ create (POST); a coupon ⇒ edit (PATCH, changed fields only).
 * Client-side validation mirrors the backend rules (value range by type, currency
 * required for fixed, ends_at > starts_at) and surfaces as a synthetic
 * `ProblemDetails` through `<AdminFormModal :error>` so it renders identically to a
 * server 409/422. The duplicate-code 409 falls through to the same alert.
 *
 * Datetimes round-trip through `<input type="datetime-local">` (local, no zone) —
 * `toLocalInput` strips the ISO zone for display, `toIso` re-attaches the browser
 * zone on submit.
 */

const props = defineProps<{
  open: boolean
  // null = create; a coupon = edit.
  coupon: CouponResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const createCoupon = useCreateCoupon()
const updateCoupon = useUpdateCoupon()

const CURRENCIES: CouponCurrency[] = ['USD', 'PLN', 'EUR']

const state = reactive({
  code: '',
  description: '',
  discount_type: 'percent' as CouponDiscountType,
  value: null as number | null,
  currency: null as CouponCurrency | null,
  min_order_amount: null as number | null,
  max_uses: null as number | null,
  per_user_limit: null as number | null,
  starts_at: '',
  ends_at: '',
  is_automatic: false,
  is_active: true,
})
const error = ref<unknown>(null)

const isEdit = computed(() => props.coupon !== null)
const loading = computed(() => createCoupon.isLoading.value || updateCoupon.isLoading.value)
const isPercent = computed(() => state.discount_type === 'percent')
const isFreeShipping = computed(() => state.discount_type === 'free_shipping')

const discountTypeOptions = computed(() => [
  { label: t('admin.coupons.discountType.percent'), value: 'percent' as const },
  { label: t('admin.coupons.discountType.fixed'), value: 'fixed' as const },
  { label: t('admin.coupons.discountType.free_shipping'), value: 'free_shipping' as const },
])
const currencyOptions = computed(() =>
  CURRENCIES.map(c => ({ label: c, value: c })),
)

const valueHint = computed(() =>
  isPercent.value
    ? t('admin.coupons.form.valuePercentHint')
    : t('admin.coupons.form.valueFixedHint'),
)

// `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in local time.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const schema = computed(() =>
  z.object({
    code: z.string().trim().min(1, t('admin.coupons.errors.codeRequired')),
    description: z.string(),
    discount_type: z.enum(['percent', 'fixed', 'free_shipping']),
    value: z.number().nullable(),
    currency: z.enum(CURRENCIES as [CouponCurrency, ...CouponCurrency[]]).nullable(),
    min_order_amount: z.number().nullable(),
    max_uses: z.number().nullable(),
    per_user_limit: z.number().nullable(),
    starts_at: z.string(),
    ends_at: z.string(),
    is_automatic: z.boolean(),
    is_active: z.boolean(),
  }).superRefine((val, ctx) => {
    // free_shipping carries no value/currency — the payload forces value 0 +
    // currency null (the backend 422s any other combination).
    if (val.discount_type === 'percent') {
      if (val.value === null || val.value < 1 || val.value > 100) {
        ctx.addIssue({ code: 'custom', message: t('admin.coupons.errors.valuePercentRange'), path: ['value'] })
      }
    }
    else if (val.discount_type === 'fixed') {
      if (val.value === null || val.value <= 0) {
        ctx.addIssue({ code: 'custom', message: t('admin.coupons.errors.valueFixedPositive'), path: ['value'] })
      }
      if (!val.currency) {
        ctx.addIssue({ code: 'custom', message: t('admin.coupons.errors.currencyRequired'), path: ['currency'] })
      }
    }
    const startsIso = toIso(val.starts_at)
    const endsIso = toIso(val.ends_at)
    if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
      ctx.addIssue({ code: 'custom', message: t('admin.coupons.errors.endsBeforeStarts'), path: ['ends_at'] })
    }
  }),
)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const c = props.coupon
    state.code = c?.code ?? ''
    state.description = c?.description ?? ''
    state.discount_type = c?.discount_type ?? 'percent'
    state.value = c?.value ?? null
    state.currency = c?.currency ?? null
    state.min_order_amount = c?.min_order_amount ?? null
    state.max_uses = c?.max_uses ?? null
    state.per_user_limit = c?.per_user_limit ?? null
    state.starts_at = toLocalInput(c?.starts_at)
    state.ends_at = toLocalInput(c?.ends_at)
    state.is_automatic = c?.is_automatic ?? false
    state.is_active = c?.is_active ?? true
  },
  // immediate so an already-open mount (and re-opens) prefill from the coupon prop.
  { immediate: true },
)

// Only fixed coupons carry a currency — clear it when switching away (percent /
// free_shipping) so a stale value never rides along on submit.
watch(() => state.discount_type, (type) => {
  if (type !== 'fixed') state.currency = null
})

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

/** Assemble the create body from validated state (client validation runs in UForm). */
function buildCreateBody(): CouponCreate {
  return {
    code: state.code.trim().toUpperCase(),
    description: state.description.trim() || null,
    discount_type: state.discount_type,
    // free_shipping: value 0 + currency null, ALWAYS sent together — flipping
    // an existing fixed coupon to free_shipping 422s unless the same PATCH
    // carries both (the edit payload is this whole body).
    value: isFreeShipping.value ? 0 : (state.value as number),
    currency: state.discount_type === 'fixed' ? state.currency : null,
    min_order_amount: state.min_order_amount,
    max_uses: state.max_uses,
    per_user_limit: state.per_user_limit,
    starts_at: toIso(state.starts_at),
    ends_at: toIso(state.ends_at),
    is_automatic: state.is_automatic,
    is_active: state.is_active,
  }
}

async function onSubmit() {
  error.value = null
  const body = buildCreateBody()
  try {
    if (props.coupon) {
      // The whole validated body doubles as the PATCH payload — the backend
      // re-validates cross-field rules against the merged state regardless.
      const patch: CouponUpdate = { ...body }
      await updateCoupon.mutateAsync({ id: props.coupon.id, patch })
      toast.add({
        title: t('admin.coupons.flashes.updated'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    else {
      await createCoupon.mutateAsync(body)
      toast.add({
        title: t('admin.coupons.flashes.created'),
        color: 'success',
        icon: 'i-lucide-check',
      })
    }
    emit('saved')
    openModel.value = false
  }
  catch (err) {
    error.value = err
  }
}
</script>

<template>
  <AdminFormModal
    :open="openModel"
    :title="isEdit ? t('admin.coupons.form.editTitle') : t('admin.coupons.form.createTitle')"
    :submit-label="t('admin.coupons.form.save')"
    :cancel-label="t('admin.coupons.form.cancel')"
    :loading="loading"
    :error="error"
    :schema="schema"
    :state="state"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          :label="t('admin.coupons.form.code')"
          :help="t('admin.coupons.form.codeHint')"
          name="code"
          required
        >
          <UInput
            v-model="state.code"
            class="w-full font-mono uppercase"
          />
        </UFormField>

        <UFormField
          :label="t('admin.coupons.form.description')"
          name="description"
        >
          <UTextarea
            v-model="state.description"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.coupons.form.discountType')"
            name="discount_type"
          >
            <USelect
              v-model="state.discount_type"
              :items="discountTypeOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="!isFreeShipping"
            :label="t('admin.coupons.form.value')"
            :help="valueHint"
            name="value"
            required
          >
            <UInputNumber
              v-model="state.value"
              :min="0"
              :step="isPercent ? 1 : 0.01"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          v-if="!isPercent && !isFreeShipping"
          :label="t('admin.coupons.form.currency')"
          :help="t('admin.coupons.form.currencyHint')"
          name="currency"
        >
          <USelect
            v-model.nullable="state.currency"
            :items="currencyOptions"
            value-key="value"
            :placeholder="t('admin.coupons.form.currency')"
            class="w-full sm:w-48"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.coupons.form.minOrderAmount')"
            :help="t('admin.coupons.form.minOrderAmountHint')"
            name="min_order_amount"
          >
            <UInputNumber
              v-model="state.min_order_amount"
              :min="0"
              :step="0.01"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.coupons.form.maxUses')"
            :help="t('admin.coupons.form.maxUsesHint')"
            name="max_uses"
          >
            <UInputNumber
              v-model="state.max_uses"
              :min="1"
              :step="1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.coupons.form.perUserLimit')"
            :help="t('admin.coupons.form.perUserLimitHint')"
            name="per_user_limit"
          >
            <UInputNumber
              v-model="state.per_user_limit"
              :min="1"
              :step="1"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.coupons.form.startsAt')"
            name="starts_at"
          >
            <UInput
              v-model="state.starts_at"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.coupons.form.endsAt')"
            :help="t('admin.coupons.form.scheduleHint')"
            name="ends_at"
          >
            <UInput
              v-model="state.ends_at"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          :label="t('admin.coupons.form.isAutomatic')"
          :help="t('admin.coupons.form.isAutomaticHint')"
          name="is_automatic"
        >
          <USwitch
            v-model="state.is_automatic"
            data-testid="coupon-is-automatic"
          />
        </UFormField>

        <UFormField
          :label="t('admin.coupons.form.isActive')"
          name="is_active"
        >
          <USwitch v-model="state.is_active" />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
