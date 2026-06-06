<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type {
  CouponCreate,
  CouponCurrency,
  CouponDiscountType,
  CouponResponse,
  CouponUpdate,
} from '~/composables/queries/useCouponQueries'
import { parseProblem } from '#shared/utils/problemDetails'

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

const code = ref('')
const description = ref('')
const discountType = ref<CouponDiscountType>('percent')
const value = ref<number | null>(null)
const currency = ref<CouponCurrency | null>(null)
const minOrderAmount = ref<number | null>(null)
const maxUses = ref<number | null>(null)
const perUserLimit = ref<number | null>(null)
const startsAt = ref('')
const endsAt = ref('')
const isActive = ref(true)
const error = ref<ProblemDetails | null>(null)

const isEdit = computed(() => props.coupon !== null)
const loading = computed(() => createCoupon.isLoading.value || updateCoupon.isLoading.value)
const isPercent = computed(() => discountType.value === 'percent')

const discountTypeOptions = computed(() => [
  { label: t('admin.coupons.discountType.percent'), value: 'percent' as const },
  { label: t('admin.coupons.discountType.fixed'), value: 'fixed' as const },
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

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const c = props.coupon
    code.value = c?.code ?? ''
    description.value = c?.description ?? ''
    discountType.value = c?.discount_type ?? 'percent'
    value.value = c?.value ?? null
    currency.value = c?.currency ?? null
    minOrderAmount.value = c?.min_order_amount ?? null
    maxUses.value = c?.max_uses ?? null
    perUserLimit.value = c?.per_user_limit ?? null
    startsAt.value = toLocalInput(c?.starts_at)
    endsAt.value = toLocalInput(c?.ends_at)
    isActive.value = c?.is_active ?? true
  },
  // immediate so an already-open mount (and re-opens) prefill from the coupon prop.
  { immediate: true },
)

// Percent coupons carry no currency — clear it when switching away from fixed so a
// stale value never rides along on submit.
watch(isPercent, (percent) => {
  if (percent) currency.value = null
})

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function fail(messageKey: string): null {
  error.value = { title: t(messageKey) }
  return null
}

/** Validate + assemble the create body. Returns null (and sets `error`) on failure. */
function buildCreateBody(): CouponCreate | null {
  const trimmedCode = code.value.trim().toUpperCase()
  if (!trimmedCode) return fail('admin.coupons.errors.codeRequired')

  const v = value.value
  if (isPercent.value) {
    if (v === null || v < 1 || v > 100) return fail('admin.coupons.errors.valuePercentRange')
  }
  else {
    if (v === null || v <= 0) return fail('admin.coupons.errors.valueFixedPositive')
    if (!currency.value) return fail('admin.coupons.errors.currencyRequired')
  }

  const startsIso = toIso(startsAt.value)
  const endsIso = toIso(endsAt.value)
  if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
    return fail('admin.coupons.errors.endsBeforeStarts')
  }

  const trimmedDescription = description.value.trim()
  return {
    code: trimmedCode,
    description: trimmedDescription || null,
    discount_type: discountType.value,
    value: v as number,
    currency: isPercent.value ? null : currency.value,
    min_order_amount: minOrderAmount.value,
    max_uses: maxUses.value,
    per_user_limit: perUserLimit.value,
    starts_at: startsIso,
    ends_at: endsIso,
    is_active: isActive.value,
  }
}

async function onSubmit() {
  error.value = null
  const body = buildCreateBody()
  if (body === null) return
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
    error.value = parseProblem(err)
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
            v-model="code"
            class="w-full font-mono uppercase"
          />
        </UFormField>

        <UFormField
          :label="t('admin.coupons.form.description')"
          name="description"
        >
          <UTextarea
            v-model="description"
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
              v-model="discountType"
              :items="discountTypeOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.coupons.form.value')"
            :help="valueHint"
            name="value"
            required
          >
            <UInputNumber
              v-model="value"
              :min="0"
              :step="isPercent ? 1 : 0.01"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          v-if="!isPercent"
          :label="t('admin.coupons.form.currency')"
          :help="t('admin.coupons.form.currencyHint')"
          name="currency"
        >
          <USelect
            v-model="currency"
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
              v-model="minOrderAmount"
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
              v-model="maxUses"
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
              v-model="perUserLimit"
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
              v-model="startsAt"
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
              v-model="endsAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          :label="t('admin.coupons.form.isActive')"
          name="is_active"
        >
          <USwitch v-model="isActive" />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
