<script setup lang="ts">
import { z } from 'zod'
import type { StaffResponse, UserRole } from '~/composables/queries/useStaffQueries'

const props = defineProps<{
  open: boolean
  // The staff row being edited (null while the dialog is closed/uninitialised).
  member: StaffResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const updateStaff = useUpdateStaff()

const state = reactive({
  role: 'CUSTOMER' as UserRole,
  is_active: true,
})
const error = ref<unknown>(null)

const schema = computed(() =>
  z.object({
    role: z.enum(['ADMIN', 'CUSTOMER']),
    is_active: z.boolean(),
  }),
)

const loading = computed(() => updateStaff.isLoading.value)

const roleOptions = computed(() => [
  { label: t('admin.staff.roles.admin'), value: 'ADMIN' },
  { label: t('admin.staff.roles.customer'), value: 'CUSTOMER' },
])

const memberName = computed(() => {
  const m = props.member
  if (!m) return ''
  const full = `${m.first_name} ${m.last_name}`.trim()
  return full || m.email
})

// Prefill from the member prop whenever the dialog opens (immediate so an
// already-open mount also seeds correctly).
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    state.role = props.member?.role ?? 'CUSTOMER'
    state.is_active = props.member?.is_active ?? true
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

async function onSubmit() {
  if (!props.member) return
  error.value = null
  try {
    await updateStaff.mutateAsync({
      userId: props.member.id,
      patch: { role: state.role, is_active: state.is_active },
    })
    toast.add({
      title: t('admin.staff.flashes.updated'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    emit('saved')
    openModel.value = false
  }
  catch (err) {
    // Surface the backend guard message (self-lockout / last-active-admin) in
    // the dialog rather than pre-disabling the controls.
    error.value = err
  }
}
</script>

<template>
  <AdminFormModal
    :open="openModel"
    :title="t('admin.staff.dialog.title', { name: memberName })"
    :submit-label="t('admin.staff.dialog.save')"
    :cancel-label="t('admin.staff.dialog.cancel')"
    :loading="loading"
    :error="error"
    :schema="schema"
    :state="state"
    @update:open="(v) => (openModel = v)"
    @submit="onSubmit"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-muted text-sm">
          {{ member?.email }}
        </p>

        <UFormField
          :label="t('admin.staff.dialog.role')"
          name="role"
        >
          <USelect
            v-model="state.role"
            :items="roleOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.staff.dialog.active')"
          :help="t('admin.staff.dialog.activeHint')"
          name="is_active"
        >
          <USwitch v-model="state.is_active" />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
