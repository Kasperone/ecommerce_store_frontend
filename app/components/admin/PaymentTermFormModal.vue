<script setup lang="ts">
import { z } from 'zod'
import type {
  PaymentTermCreate,
  PaymentTermResponse,
  PaymentTermUpdate,
} from '~/composables/queries/usePaymentTermQueries'

/**
 * Create / edit a B2B payment term (net-terms tail Program A).
 *
 * `term === null` ⇒ create (POST); a term ⇒ edit (PATCH). The `term_type`
 * (net_days / due_on_receipt / fixed_date) drives which parameter field shows;
 * validation enforces the matching parameter is set (mirrors the backend CHECK).
 */

const props = defineProps<{
  open: boolean
  term: PaymentTermResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [term: PaymentTermResponse]
}>()

const { t } = useI18n()
const toast = useToast()

const createTerm = useCreatePaymentTerm()
const updateTerm = useUpdatePaymentTerm()

const TERM_TYPES = ['net_days', 'due_on_receipt', 'fixed_date'] as const

const state = reactive({
  name: '',
  term_type: 'net_days' as (typeof TERM_TYPES)[number],
  net_days: 30 as number | null,
  due_date: '' as string,
  is_active: true,
  notes: '',
})
const error = ref<unknown>(null)

const termTypeItems = computed(() =>
  TERM_TYPES.map(tt => ({ label: t(`admin.paymentTerms.types.${tt}`), value: tt })),
)

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('admin.paymentTerms.errors.nameRequired')),
    term_type: z.enum(TERM_TYPES),
    net_days: z.number().int().min(0).max(365).nullable(),
    due_date: z.string(),
    is_active: z.boolean(),
    notes: z.string(),
  }).superRefine((val, ctx) => {
    if (val.term_type === 'net_days' && val.net_days == null) {
      ctx.addIssue({ code: 'custom', path: ['net_days'], message: t('admin.paymentTerms.errors.netDaysRequired') })
    }
    if (val.term_type === 'fixed_date' && !val.due_date) {
      ctx.addIssue({ code: 'custom', path: ['due_date'], message: t('admin.paymentTerms.errors.dueDateRequired') })
    }
  }),
)

const isEdit = computed(() => props.term !== null)
const loading = computed(() => createTerm.isLoading.value || updateTerm.isLoading.value)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    const tm = props.term
    state.name = tm?.name ?? ''
    state.term_type = (tm?.term_type as (typeof TERM_TYPES)[number]) ?? 'net_days'
    state.net_days = tm?.net_days ?? 30
    state.due_date = tm?.due_date ?? ''
    state.is_active = tm?.is_active ?? true
    state.notes = tm?.notes ?? ''
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

/** Assemble the create/patch body, nulling the parameter the type doesn't use. */
function buildBody(): PaymentTermCreate {
  const notes = state.notes.trim() || null
  return {
    name: state.name.trim(),
    term_type: state.term_type,
    net_days: state.term_type === 'net_days' ? state.net_days : null,
    due_date: state.term_type === 'fixed_date' ? state.due_date || null : null,
    is_active: state.is_active,
    notes,
  }
}

async function onSubmit() {
  error.value = null
  try {
    let saved: PaymentTermResponse
    if (props.term) {
      saved = await updateTerm.mutateAsync({ id: props.term.id, patch: buildBody() as PaymentTermUpdate })
      toast.add({ title: t('admin.paymentTerms.flashes.updated'), color: 'success', icon: 'i-lucide-check' })
    }
    else {
      saved = await createTerm.mutateAsync(buildBody())
      toast.add({ title: t('admin.paymentTerms.flashes.created'), color: 'success', icon: 'i-lucide-check' })
    }
    emit('saved', saved)
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
    :title="isEdit ? t('admin.paymentTerms.form.editTitle') : t('admin.paymentTerms.form.createTitle')"
    :submit-label="t('admin.paymentTerms.form.save')"
    :cancel-label="t('admin.paymentTerms.form.cancel')"
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
          :label="t('admin.paymentTerms.form.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
            data-testid="payment-term-name"
          />
        </UFormField>

        <UFormField
          :label="t('admin.paymentTerms.form.type')"
          name="term_type"
        >
          <USelect
            v-model="state.term_type"
            :items="termTypeItems"
            value-key="value"
            class="w-full"
            data-testid="payment-term-type"
          />
        </UFormField>

        <UFormField
          v-if="state.term_type === 'net_days'"
          :label="t('admin.paymentTerms.form.netDays')"
          :help="t('admin.paymentTerms.form.netDaysHint')"
          name="net_days"
        >
          <UInput
            v-model.number="state.net_days"
            type="number"
            min="0"
            max="365"
            class="w-full"
            data-testid="payment-term-net-days"
          />
        </UFormField>

        <UFormField
          v-if="state.term_type === 'fixed_date'"
          :label="t('admin.paymentTerms.form.dueDate')"
          name="due_date"
        >
          <UInput
            v-model="state.due_date"
            type="date"
            class="w-full"
            data-testid="payment-term-due-date"
          />
        </UFormField>

        <UFormField
          :label="t('admin.paymentTerms.form.active')"
          :help="t('admin.paymentTerms.form.activeHint')"
          name="is_active"
        >
          <USwitch v-model="state.is_active" />
        </UFormField>

        <UFormField
          :label="t('admin.paymentTerms.form.notes')"
          name="notes"
        >
          <UTextarea
            v-model="state.notes"
            :rows="2"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
