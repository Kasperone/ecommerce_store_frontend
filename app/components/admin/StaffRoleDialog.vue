<script setup lang="ts">
import type { StaffResponse, UserRole } from '~/composables/queries/useStaffQueries'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

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

const role = ref<UserRole>('CUSTOMER')
const isActive = ref(true)
const error = ref<ProblemDetails | null>(null)

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
    role.value = props.member?.role ?? 'CUSTOMER'
    isActive.value = props.member?.is_active ?? true
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
      patch: { role: role.value, is_active: isActive.value },
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
    error.value = parseProblem(err)
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
            v-model="role"
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
          <USwitch v-model="isActive" />
        </UFormField>
      </div>
    </template>
  </AdminFormModal>
</template>
