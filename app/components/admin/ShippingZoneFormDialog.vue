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
import { countryOptions } from '#shared/utils/countries'
import type { SupportedLocale } from '#shared/utils/countries'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type { ShippingZoneDetail, ShippingZoneListItem } from '#shared/types/api'

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
})
const error = ref<ProblemDetails | null>(null)

const countryItems = computed(() => countryOptions(locale.value as SupportedLocale))

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    if (props.zone) {
      state.name = props.zone.name
      state.description = props.zone.description ?? ''
      state.is_active = props.zone.is_active
      state.sort_order = props.zone.sort_order
      state.country_codes = [...(props.initialCountryCodes ?? [])]
    }
    else {
      state.name = ''
      state.description = ''
      state.is_active = true
      state.sort_order = 0
      state.country_codes = []
    }
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  error.value = null
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
      })
      toast.add({ title: t('admin.shipping.flashes.zoneCreated') })
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
            {{ mode === 'edit' ? t('admin.shipping.zones.edit') : t('admin.shipping.zones.create') }}
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

          <UFormField
            :label="t('admin.shipping.zones.name')"
            required
          >
            <UInput
              v-model="state.name"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('admin.shipping.zones.description')">
            <UTextarea
              v-model="state.description"
              :placeholder="t('admin.shipping.zones.descriptionPlaceholder')"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('admin.shipping.zones.sortOrder')">
              <UInputNumber
                v-model="state.sort_order"
                :min="0"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.shipping.zones.active')">
              <UCheckbox
                v-model="state.is_active"
                :label="t('admin.shipping.zones.fields.activeOn')"
              />
            </UFormField>
          </div>

          <UFormField
            :label="t('admin.shipping.zones.countries')"
            :hint="t('admin.shipping.zones.countriesHint')"
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
              :disabled="state.name.trim().length === 0"
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
