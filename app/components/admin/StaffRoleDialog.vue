<script setup lang="ts">
import { z } from 'zod'
import type { StaffResponse, StaffUpdate, UserRole } from '~/composables/queries/useStaffQueries'
import { CAPABILITIES } from '#shared/constants/capabilities'

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
const auth = useAuthStore()

const updateStaff = useUpdateStaff()

// Only an owner may manage the owner flag / capabilities (the backend enforces
// this too — a non-owner sending those fields gets a 403). Non-owners see the
// role/active controls only.
const canManageOwner = computed(() => auth.isOwner)

const state = reactive({
  role: 'CUSTOMER' as UserRole,
  is_active: true,
  is_owner: false,
  capabilities: [] as string[],
})
const error = ref<unknown>(null)

const schema = computed(() =>
  z.object({
    role: z.enum(['ADMIN', 'CUSTOMER']),
    is_active: z.boolean(),
    is_owner: z.boolean(),
    capabilities: z.array(z.string()),
  }),
)

const loading = computed(() => updateStaff.isLoading.value)

const roleOptions = computed(() => [
  { label: t('admin.staff.roles.admin'), value: 'ADMIN' },
  { label: t('admin.staff.roles.customer'), value: 'CUSTOMER' },
])

// Capability checkbox rows (label + hint from i18n). An owner holds every
// capability implicitly, so the explicit set is only editable when is_owner is
// off and the target is an admin.
const capabilityOptions = computed(() =>
  CAPABILITIES.map(cap => ({
    value: cap,
    label: t(`admin.staff.capabilities.${cap}.label`),
    hint: t(`admin.staff.capabilities.${cap}.hint`),
  })),
)

const capabilitiesDisabled = computed(() => state.is_owner || state.role !== 'ADMIN')
const ownerToggleDisabled = computed(() => state.role !== 'ADMIN')

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
    state.is_owner = props.member?.is_owner ?? false
    state.capabilities = [...(props.member?.capabilities ?? [])]
  },
  { immediate: true },
)

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

function toggleCapability(cap: string, checked: boolean) {
  const set = new Set(state.capabilities)
  if (checked) set.add(cap)
  else set.delete(cap)
  state.capabilities = [...set]
}

async function onSubmit() {
  if (!props.member) return
  error.value = null
  // Non-owners only send role/active — sending owner/capabilities would (rightly)
  // 403 as privilege escalation. Owners send the full patch.
  const patch: StaffUpdate = { role: state.role, is_active: state.is_active }
  if (canManageOwner.value) {
    patch.is_owner = state.is_owner
    patch.capabilities = state.capabilities
  }
  try {
    await updateStaff.mutateAsync({ userId: props.member.id, patch })
    toast.add({
      title: t('admin.staff.flashes.updated'),
      color: 'success',
      icon: 'i-lucide-check',
    })
    emit('saved')
    openModel.value = false
  }
  catch (err) {
    // Surface the backend guard message (self-lockout / last-active-admin /
    // last-owner / escalation) in the dialog rather than pre-disabling controls.
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

        <!-- Owner + capability management is owner-only. -->
        <template v-if="canManageOwner">
          <USeparator />

          <UFormField
            :label="t('admin.staff.dialog.owner')"
            :help="t('admin.staff.dialog.ownerHint')"
            name="is_owner"
          >
            <USwitch
              v-model="state.is_owner"
              :disabled="ownerToggleDisabled"
            />
          </UFormField>

          <UFormField
            :label="t('admin.staff.dialog.capabilities')"
            :help="state.is_owner
              ? t('admin.staff.dialog.capabilitiesOwnerHint')
              : t('admin.staff.dialog.capabilitiesHint')"
            name="capabilities"
          >
            <div class="space-y-2">
              <UCheckbox
                v-for="opt in capabilityOptions"
                :key="opt.value"
                :model-value="state.is_owner || state.capabilities.includes(opt.value)"
                :disabled="capabilitiesDisabled"
                :label="opt.label"
                :description="opt.hint"
                @update:model-value="(v) => toggleCapability(opt.value, v === true)"
              />
            </div>
          </UFormField>
        </template>
      </div>
    </template>
  </AdminFormModal>
</template>
