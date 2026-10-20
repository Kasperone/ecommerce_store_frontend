<script setup lang="ts">
/**
 * Create/edit a shipping zone (admin).
 *
 * Country assignment is replace-semantics: the dialog renders a multi-select
 * over `shared/utils/countries.ts` (PL-first, localized labels), and the
 * backend's `ShippingZoneCreate`/`Update` carry the full desired list. When
 * the backend rejects a country already-in-another-zone, the route returns
 * 400 with the conflicting zone name in `detail`; we surface that as an
 * inline `<ErrorAlert>`.
 */

import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { countryOptions } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'
import type { ShippingZoneDetail, ShippingZoneListItem } from '#shared/types/api'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'

const props = defineProps<{
  open: boolean
  /** Existing zone for edit; null for create. Detail variant needed for `country_codes`. */
  zone?: ShippingZoneListItem | ShippingZoneDetail | null
  /** Country codes already on the zone — needed because list items don't carry them. */
  initialCountryCodes?: string[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  /** Closes the dialog + bubbles "we wrote a row" so the page refetches. */
  'saved': []
}>()

const { t, locale } = useI18n()
const toast = useToast()
const create = useCreateShippingZone()
const update = useUpdateShippingZone()

const mode = computed<'create' | 'edit'>(() => (props.zone ? 'edit' : 'create'))
const loading = computed(() => create.isLoading.value || update.isLoading.value)

const state = reactive({
  name: '',
  description: '',
  is_active: true,
  sort_order: 0,
  country_codes: [] as string[],
  // cm³/kg divisor for volumetric weight pricing. Undefined = "leave NULL"
  // (the backend skips the volumetric branch — actual weight only). 5000 is
  // the PL/EU ground default; 6000 international air; 4000 some express.
  dim_divisor: undefined as number | undefined,
})

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('messages.fieldRequired')),
    description: z.string(),
    is_active: z.boolean(),
    sort_order: z.number(),
    country_codes: z.array(z.string()),
    dim_divisor: z.number().min(1).optional(),
  }),
)

const formRef = useTemplateRef<ValidatedFormInstance>('formRef')
const hiddenSubmitRef = ref<HTMLButtonElement | null>(null)
const { errorMessage, applyApiError } = useValidatedForm(formRef, {
  state: () => state,
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

const countryItems = computed(() => countryOptions(locale.value as SupportedLocale))

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    errorMessage.value = ''
    if (props.zone) {
      state.name = props.zone.name
      state.description = props.zone.description ?? ''
      state.is_active = props.zone.is_active
      state.sort_order = props.zone.sort_order
      state.country_codes = [...(props.initialCountryCodes ?? [])]
      state.dim_divisor = props.zone.dim_divisor ?? undefined
    }
    else {
      state.name = ''
      state.description = ''
      state.is_active = true
      state.sort_order = 0
      state.country_codes = []
      state.dim_divisor = undefined
    }
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  errorMessage.value = ''
  try {
    if (props.zone) {
      await update.mutateAsync({
        id: props.zone.id,
        patch: {
          name: state.name,
          description: state.description.trim() || null,
          is_active: state.is_active,
          sort_order: state.sort_order,
          country_codes: state.country_codes,
          // `?? null` so clearing the field in the UI explicitly sends null
          // (the backend understands the "absent vs explicitly null"
          // distinction via model_fields_set — null means "turn off DIM").
          dim_divisor: state.dim_divisor ?? null,
        },
      })
      toast.add({ title: t('admin.shipping.flashes.zoneUpdated') })
    }
    else {
      await create.mutateAsync({
        name: state.name,
        description: state.description.trim() || null,
        is_active: state.is_active,
        sort_order: state.sort_order,
        country_codes: state.country_codes,
        dim_divisor: state.dim_divisor ?? null,
      })
      toast.add({ title: t('admin.shipping.flashes.zoneCreated') })
    }
    emit('saved')
    emit('update:open', false)
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}
</script>

<template>
  <UModal v-model:open="openModel">
    <template #content>
      <UCard>
        <template #header>
          <h2 class="text-base font-semibold">
            {{ mode === 'edit' ? t('admin.shipping.zones.edit') : t('admin.shipping.zones.create') }}
          </h2>
        </template>

        <UForm
          ref="formRef"
          :schema="schema"
          :state="state"
          :validate-on="[]"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UAlert
            v-if="errorMessage"
            role="alert"
            color="error"
            variant="soft"
            :title="t('messages.saveErrorTitle')"
            :description="errorMessage"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="errorMessage = ''"
          />

          <UFormField
            :label="t('admin.shipping.zones.name')"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.shipping.zones.description')"
            name="description"
          >
            <UTextarea
              v-model="state.description"
              :placeholder="t('admin.shipping.zones.descriptionPlaceholder')"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('admin.shipping.zones.sortOrder')"
              name="sort_order"
            >
              <UInputNumber
                v-model="state.sort_order"
                :min="0"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.shipping.zones.active')"
              name="is_active"
            >
              <UCheckbox
                v-model="state.is_active"
                :label="t('admin.shipping.zones.fields.activeOn')"
              />
            </UFormField>
          </div>

          <UFormField
            :label="t('admin.shipping.zones.countries')"
            :hint="t('admin.shipping.zones.countriesHint')"
            name="country_codes"
          >
            <USelectMenu
              v-model="state.country_codes"
              :items="countryItems"
              multiple
              value-key="value"
              :placeholder="t('admin.shipping.zones.countriesPlaceholder')"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('admin.shipping.zones.dimDivisor')"
            :hint="t('admin.shipping.zones.dimDivisorHint')"
            name="dim_divisor"
          >
            <UInputNumber
              v-model="state.dim_divisor"
              :min="1"
              :step="100"
              :placeholder="t('admin.shipping.zones.dimDivisorPlaceholder')"
              class="w-full sm:max-w-xs"
            />
          </UFormField>

          <button
            ref="hiddenSubmitRef"
            type="submit"
            hidden
            aria-hidden="true"
            tabindex="-1"
            :disabled="loading"
          />
        </UForm>

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
              @click="hiddenSubmitRef?.click()"
            >
              {{ t('actions.save') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
