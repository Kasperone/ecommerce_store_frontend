<script setup lang="ts">
import { z } from 'zod'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { StoreConfig, StoreConfigUpdate } from '~/composables/queries/useSettingsQueries'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

const props = defineProps<{
  /** The loaded store-config singleton; null while the GET is in flight. */
  config?: StoreConfig | null
  loading?: boolean
  /** Raw caught submit error, surfaced via the gold-standard flow. */
  error?: unknown
}>()

const emit = defineEmits<{
  submit: [value: StoreConfigUpdate]
}>()

const { t } = useI18n()
const toast = useToast()

interface FormState {
  store_name: string
  brand_tagline: string
  email_from_name: string
  primary_color: string
  logo_url: string
  legal_name: string
  email: string
  phone: string
  address_line: string
  address_line2: string
  postal_city: string
  country: string
  nip: string
  regon: string
  krs: string
  social_instagram: string
  social_facebook: string
  social_tiktok: string
  social_youtube: string
  tax_id: string
  invoice_vat_rate: number | undefined
  returns_window_days: number | undefined
  low_stock_default_threshold: number | undefined
  abandoned_cart_enabled: boolean
  abandoned_cart_threshold_hours: number | undefined
  gift_cards_enabled: boolean
  store_credit_enabled: boolean
  // Admin-configured FX rates for B2B cross-currency net-terms credit, keyed by
  // ISO-4217 code. Each value = worth of 1 unit of that currency in a common
  // pivot (e.g. vs USD: USD=1, EUR=1.08, PLN=0.25). undefined = not convertible.
  fx_rates: Record<string, number | undefined>
}

const state = reactive<FormState>({
  store_name: '',
  brand_tagline: '',
  email_from_name: '',
  primary_color: '',
  logo_url: '',
  legal_name: '',
  email: '',
  phone: '',
  address_line: '',
  address_line2: '',
  postal_city: '',
  country: '',
  nip: '',
  regon: '',
  krs: '',
  social_instagram: '',
  social_facebook: '',
  social_tiktok: '',
  social_youtube: '',
  tax_id: '',
  invoice_vat_rate: undefined,
  returns_window_days: undefined,
  low_stock_default_threshold: undefined,
  abandoned_cart_enabled: false,
  abandoned_cart_threshold_hours: undefined,
  gift_cards_enabled: false,
  store_credit_enabled: false,
  fx_rates: Object.fromEntries(
    CURRENCIES.map(c => [c.code, undefined]),
  ) as Record<string, number | undefined>,
})

watch(
  () => props.config,
  (config) => {
    if (!config) return
    state.store_name = config.store_name
    state.brand_tagline = config.brand_tagline
    state.email_from_name = config.email_from_name
    state.primary_color = config.primary_color
    state.logo_url = config.logo_url
    state.legal_name = config.legal_name
    state.email = config.email
    state.phone = config.phone
    state.address_line = config.address_line
    state.address_line2 = config.address_line2
    state.postal_city = config.postal_city
    state.country = config.country
    state.nip = config.nip
    state.regon = config.regon
    state.krs = config.krs
    state.social_instagram = config.social_instagram
    state.social_facebook = config.social_facebook
    state.social_tiktok = config.social_tiktok
    state.social_youtube = config.social_youtube
    state.tax_id = config.tax_id
    state.invoice_vat_rate = config.invoice_vat_rate
    state.returns_window_days = config.returns_window_days
    state.low_stock_default_threshold = config.low_stock_default_threshold ?? undefined
    state.abandoned_cart_enabled = config.abandoned_cart_enabled ?? false
    state.abandoned_cart_threshold_hours = config.abandoned_cart_threshold_hours
    state.gift_cards_enabled = config.gift_cards_enabled ?? false
    state.store_credit_enabled = config.store_credit_enabled ?? false
    for (const { code } of CURRENCIES) {
      state.fx_rates[code] = config.fx_rates?.[code] ?? undefined
    }
  },
  // immediate so a config already resolved at mount prefills the fields.
  { immediate: true },
)

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

// The page owns the PATCH fetch; surface its raw error here so the form drives
// the same flow as signin (message + backend field mapping).
watch(
  () => props.error,
  (err) => {
    if (err) applyApiError(err, t('messages.saveError'))
    else errorMessage.value = ''
  },
)

// Client-side guard mirroring the backend CHECK (invoice_vat_rate 0–100). The
// backend also 422s out-of-range values; those surface via <UAlert>.
//
// store_name is the one always-present field (seeded with a default); every
// other field is optional — store_config is seeded blank and the backend
// accepts empty for all of them (partial PATCH, server_default=''). Only the
// email *format* is validated, and only when a value is entered. Social fields
// are free-form (handle or URL) to match the backend, which stores them verbatim.
const schema = computed(() =>
  z.object({
    store_name: z.string().min(1, t('admin.settings.errors.required')),
    brand_tagline: z.string(),
    email_from_name: z.string(),
    primary_color: z.string().regex(/^#[0-9a-f]{6}$/i, t('admin.settings.errors.hexColor')).or(z.literal('')),
    logo_url: z.string(),
    legal_name: z.string(),
    email: z.string().email(t('admin.settings.errors.email')).or(z.literal('')),
    phone: z.string(),
    address_line: z.string(),
    address_line2: z.string(),
    postal_city: z.string(),
    country: z.string(),
    nip: z.string(),
    regon: z.string(),
    krs: z.string(),
    social_instagram: z.string(),
    social_facebook: z.string(),
    social_tiktok: z.string(),
    social_youtube: z.string(),
    tax_id: z.string(),
    invoice_vat_rate: z
      .number({ message: t('admin.settings.errors.vatRange') })
      .min(0, t('admin.settings.errors.vatRange'))
      .max(100, t('admin.settings.errors.vatRange')),
    // Mirrors the backend CHECK (>= 0). 0 = returns disabled store-wide.
    returns_window_days: z
      .number({ message: t('admin.settings.errors.returnsWindow') })
      .int(t('admin.settings.errors.returnsWindow'))
      .min(0, t('admin.settings.errors.returnsWindow')),
    // Optional store-wide default low-stock threshold (>= 0). Empty → null
    // (no global default; per-product thresholds still apply).
    low_stock_default_threshold: z
      .number({ message: t('admin.settings.errors.lowStockThreshold') })
      .int(t('admin.settings.errors.lowStockThreshold'))
      .min(0, t('admin.settings.errors.lowStockThreshold'))
      .nullable(),
    abandoned_cart_enabled: z.boolean(),
    // Mirrors the backend CHECK (>= 1) + schema cap (<= 720 hours = 30 days).
    abandoned_cart_threshold_hours: z
      .number({ message: t('admin.settings.errors.abandonedCartThreshold') })
      .int(t('admin.settings.errors.abandonedCartThreshold'))
      .min(1, t('admin.settings.errors.abandonedCartThreshold'))
      .max(720, t('admin.settings.errors.abandonedCartThreshold')),
    gift_cards_enabled: z.boolean(),
    store_credit_enabled: z.boolean(),
  }),
)

function validate(values: FormState): FormError[] {
  const result = schema.value.safeParse({
    ...values,
    invoice_vat_rate: values.invoice_vat_rate ?? null,
    returns_window_days: values.returns_window_days ?? null,
    low_stock_default_threshold: values.low_stock_default_threshold ?? null,
  })
  const errors = result.success
    ? []
    : result.error.issues.map(issue => ({
        name: String(issue.path[0] ?? ''),
        message: issue.message,
      }))
  // FX rates live outside the flat zod schema (a per-currency map). Each entered
  // rate must be positive; blank means "not convertible" and is allowed.
  for (const { code } of CURRENCIES) {
    const v = values.fx_rates[code]
    if (v != null && v <= 0) {
      errors.push({ name: `fx_rate_${code}`, message: t('admin.settings.errors.fxRate') })
    }
  }
  return errors
}

function onSubmit(_event: FormSubmitEvent<FormState>) {
  const patch: StoreConfigUpdate = {
    store_name: state.store_name.trim(),
    brand_tagline: state.brand_tagline.trim(),
    email_from_name: state.email_from_name.trim(),
    primary_color: state.primary_color.trim().toLowerCase(),
    logo_url: state.logo_url.trim(),
    legal_name: state.legal_name.trim(),
    email: state.email.trim(),
    phone: state.phone.trim(),
    address_line: state.address_line.trim(),
    address_line2: state.address_line2.trim(),
    postal_city: state.postal_city.trim(),
    country: state.country.trim(),
    nip: state.nip.trim(),
    regon: state.regon.trim(),
    krs: state.krs.trim(),
    social_instagram: state.social_instagram.trim(),
    social_facebook: state.social_facebook.trim(),
    social_tiktok: state.social_tiktok.trim(),
    social_youtube: state.social_youtube.trim(),
    tax_id: state.tax_id.trim(),
    invoice_vat_rate: state.invoice_vat_rate ?? undefined,
    returns_window_days: state.returns_window_days ?? undefined,
    // Empty input clears the global default (null); a number sets it.
    low_stock_default_threshold: state.low_stock_default_threshold ?? null,
    abandoned_cart_enabled: state.abandoned_cart_enabled,
    abandoned_cart_threshold_hours: state.abandoned_cart_threshold_hours ?? undefined,
    gift_cards_enabled: state.gift_cards_enabled,
    store_credit_enabled: state.store_credit_enabled,
    // Assemble the sparse FX map: only positive entries are sent. An empty map
    // ({}) turns cross-currency net-terms credit off (every currency becomes
    // incomparable), matching the backend's "missing rate → reject" contract.
    fx_rates: CURRENCIES.reduce<Record<string, number>>((acc, { code }) => {
      const v = state.fx_rates[code]
      if (v != null && v > 0) acc[code] = v
      return acc
    }, {}),
  }
  emit('submit', patch)
}
</script>

<template>
  <UForm
    ref="formRef"
    :state="state"
    :validate="validate"
    :validate-on="['submit']"
    class="space-y-8"
    @submit="onSubmit"
  >
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="t('messages.saveErrorTitle')"
      :description="errorMessage"
      :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
      @close="errorMessage = ''"
    />

    <section class="space-y-4">
      <h2 class="text-lg font-semibold">
        {{ t('admin.settings.sections.identity') }}
      </h2>

      <UFormField
        :label="t('admin.settings.fields.storeName')"
        name="store_name"
        required
      >
        <UInput
          v-model="state.store_name"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.legalName')"
        :help="t('admin.settings.hints.legalName')"
        name="legal_name"
      >
        <UInput
          v-model="state.legal_name"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField
          :label="t('admin.settings.fields.email')"
          :help="t('admin.settings.hints.email')"
          name="email"
        >
          <UInput
            v-model="state.email"
            type="email"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.settings.fields.phone')"
          name="phone"
        >
          <UInput
            v-model="state.phone"
            type="tel"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
      </div>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.branding') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.branding') }}
        </p>
      </div>

      <UFormField
        :label="t('admin.settings.fields.brandTagline')"
        :help="t('admin.settings.hints.brandTagline')"
        name="brand_tagline"
      >
        <UInput
          v-model="state.brand_tagline"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.emailFromName')"
        :help="t('admin.settings.hints.emailFromName')"
        name="email_from_name"
      >
        <UInput
          v-model="state.email_from_name"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.primaryColor')"
        :help="t('admin.settings.hints.primaryColor')"
        name="primary_color"
      >
        <div class="flex items-center gap-2">
          <UPopover>
            <UButton
              :disabled="loading"
              color="neutral"
              variant="outline"
              :aria-label="t('admin.settings.fields.primaryColor')"
            >
              <span
                class="size-4 rounded-full border border-neutral-300 dark:border-neutral-600"
                :style="{ backgroundColor: state.primary_color || 'transparent' }"
              />
            </UButton>
            <template #content>
              <UColorPicker
                v-model="state.primary_color"
                format="hex"
                class="p-2"
              />
            </template>
          </UPopover>
          <UInput
            v-model="state.primary_color"
            :disabled="loading"
            placeholder="#16a34a"
            class="w-40 font-mono"
          />
        </div>
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.logoUrl')"
        :help="t('admin.settings.hints.logoUrl')"
        name="logo_url"
      >
        <UInput
          v-model="state.logo_url"
          type="url"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
    </section>

    <section class="space-y-4">
      <h2 class="text-lg font-semibold">
        {{ t('admin.settings.sections.address') }}
      </h2>

      <UFormField
        :label="t('admin.settings.fields.addressLine')"
        name="address_line"
      >
        <UInput
          v-model="state.address_line"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.addressLine2')"
        name="address_line2"
      >
        <UInput
          v-model="state.address_line2"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField
          :label="t('admin.settings.fields.postalCity')"
          name="postal_city"
        >
          <UInput
            v-model="state.postal_city"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.settings.fields.country')"
          name="country"
        >
          <UInput
            v-model="state.country"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
      </div>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.identifiers') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.identifiers') }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UFormField
          :label="t('admin.settings.fields.nip')"
          name="nip"
        >
          <UInput
            v-model="state.nip"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.settings.fields.regon')"
          name="regon"
        >
          <UInput
            v-model="state.regon"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.settings.fields.krs')"
          name="krs"
        >
          <UInput
            v-model="state.krs"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
      </div>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.social') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.social') }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField
          :label="t('admin.settings.fields.socialInstagram')"
          name="social_instagram"
        >
          <UInput
            v-model="state.social_instagram"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.settings.fields.socialFacebook')"
          name="social_facebook"
        >
          <UInput
            v-model="state.social_facebook"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.settings.fields.socialTiktok')"
          name="social_tiktok"
        >
          <UInput
            v-model="state.social_tiktok"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.settings.fields.socialYoutube')"
          name="social_youtube"
        >
          <UInput
            v-model="state.social_youtube"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
      </div>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.invoicing') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.invoicing') }}
        </p>
      </div>

      <UFormField
        :label="t('admin.settings.fields.taxId')"
        :help="t('admin.settings.hints.taxId')"
        name="tax_id"
        class="max-w-md"
      >
        <UInput
          v-model="state.tax_id"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.invoiceVatRate')"
        :help="t('admin.settings.hints.invoiceVatRate')"
        name="invoice_vat_rate"
        required
        class="max-w-xs"
      >
        <UInputNumber
          v-model="state.invoice_vat_rate"
          :min="0"
          :max="100"
          :step="0.5"
          :disabled="loading"
          class="w-full"
        />
      </UFormField>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.returns') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.returns') }}
        </p>
      </div>

      <UFormField
        :label="t('admin.settings.fields.returnsWindowDays')"
        :help="t('admin.settings.hints.returnsWindowDays')"
        name="returns_window_days"
        required
        class="max-w-xs"
      >
        <UInputNumber
          v-model="state.returns_window_days"
          :min="0"
          :step="1"
          :disabled="loading"
          class="w-full"
          data-testid="settings-returns-window"
        />
      </UFormField>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.inventory') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.inventory') }}
        </p>
      </div>

      <UFormField
        :label="t('admin.settings.fields.lowStockDefaultThreshold')"
        :help="t('admin.settings.hints.lowStockDefaultThreshold')"
        name="low_stock_default_threshold"
        class="max-w-xs"
      >
        <UInputNumber
          v-model="state.low_stock_default_threshold"
          :min="0"
          :step="1"
          :placeholder="t('admin.settings.fields.lowStockDefaultThresholdPlaceholder')"
          :disabled="loading"
          class="w-full"
          data-testid="settings-low-stock-threshold"
        />
      </UFormField>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.abandonedCart') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.abandonedCart') }}
        </p>
      </div>

      <UFormField
        :label="t('admin.settings.fields.abandonedCartEnabled')"
        :help="t('admin.settings.hints.abandonedCartEnabled')"
        name="abandoned_cart_enabled"
      >
        <USwitch
          v-model="state.abandoned_cart_enabled"
          :disabled="loading"
          data-testid="settings-abandoned-cart-enabled"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.abandonedCartThresholdHours')"
        :help="t('admin.settings.hints.abandonedCartThresholdHours')"
        name="abandoned_cart_threshold_hours"
        class="max-w-xs"
      >
        <UInputNumber
          v-model="state.abandoned_cart_threshold_hours"
          :min="1"
          :max="720"
          :step="1"
          :disabled="loading"
          class="w-full"
          data-testid="settings-abandoned-cart-threshold"
        />
      </UFormField>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.giftCards') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.giftCards') }}
        </p>
      </div>

      <UFormField
        :label="t('admin.settings.fields.giftCardsEnabled')"
        :help="t('admin.settings.hints.giftCardsEnabled')"
        name="gift_cards_enabled"
      >
        <USwitch
          v-model="state.gift_cards_enabled"
          :disabled="loading"
          data-testid="settings-gift-cards-enabled"
        />
      </UFormField>

      <UFormField
        :label="t('admin.settings.fields.storeCreditEnabled')"
        :help="t('admin.settings.hints.storeCreditEnabled')"
        name="store_credit_enabled"
      >
        <USwitch
          v-model="state.store_credit_enabled"
          :disabled="loading"
          data-testid="settings-store-credit-enabled"
        />
      </UFormField>
    </section>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.settings.sections.fxRates') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('admin.settings.hints.fxRates') }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UFormField
          v-for="c in CURRENCIES"
          :key="c.code"
          :label="t('admin.settings.fields.fxRate', { currency: c.code })"
          :name="`fx_rate_${c.code}`"
        >
          <UInputNumber
            v-model="state.fx_rates[c.code]"
            :min="0"
            :step="0.01"
            :format-options="{ minimumFractionDigits: 0, maximumFractionDigits: 6 }"
            :disabled="loading"
            :placeholder="t('admin.settings.fields.fxRatePlaceholder')"
            class="w-full"
            :data-testid="`settings-fx-rate-${c.code}`"
          />
        </UFormField>
      </div>
    </section>

    <div class="flex justify-end gap-2 pt-4 border-t border-default">
      <UButton
        type="submit"
        color="primary"
        :loading="loading"
      >
        {{ t('admin.settings.actions.save') }}
      </UButton>
    </div>
  </UForm>
</template>
