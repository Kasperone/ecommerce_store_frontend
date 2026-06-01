<script setup lang="ts">
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import type { StaffResponse } from '~/composables/queries/useStaffQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.staff.title') })

const authStore = useAuthStore()

const filterSchema = z.object({
  search: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
})
const defaults = {
  search: undefined as string | undefined,
  page: 1,
  pageSize: 20,
}
const { filters, set } = useUrlFilters(filterSchema, defaults)

const searchValue = computed(() => filters.value.search ?? '')

const queryParams = computed(() => ({
  page: filters.value.page ?? 1,
  pageSize: filters.value.pageSize ?? 20,
  search: searchValue.value || undefined,
}))

const { data: pageData, error: listError } = useStaffQuery(queryParams)
const items = computed<StaffResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const hasFilter = computed(() => searchValue.value.length > 0)

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function fullName(member: StaffResponse) {
  return `${member.first_name} ${member.last_name}`.trim() || member.email
}

// Informational only: highlight the acting admin's own row. We match by email
// because the hand-rolled UserResponse type carries no id. The actual
// self-lockout / last-active-admin protection is enforced by the backend and
// surfaced via the dialog's ErrorAlert — we never pre-disable here.
function isSelf(member: StaffResponse) {
  const email = authStore.user?.email
  return !!email && email === member.email
}

const columns: TableColumn<StaffResponse>[] = [
  { accessorKey: 'name', header: () => t('admin.staff.fields.name') },
  { accessorKey: 'email', header: () => t('admin.staff.fields.email') },
  { accessorKey: 'role', header: () => t('admin.staff.fields.role') },
  { accessorKey: 'is_active', header: () => t('admin.staff.fields.status') },
  { accessorKey: 'created_at', header: () => t('admin.staff.fields.createdAt') },
  { id: 'actions', header: '' },
]

// Role / active edit dialog.
const dialogOpen = ref(false)
const editing = ref<StaffResponse | null>(null)

function openEdit(member: StaffResponse) {
  editing.value = member
  dialogOpen.value = true
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.staff.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.staff.subtitle') }}
          </p>
        </div>
      </header>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="$t('admin.staff.filters.search')">
          <UInput
            :model-value="searchValue"
            :placeholder="$t('admin.staff.filters.searchPlaceholder')"
            icon="i-lucide-search"
            class="w-60"
            @update:model-value="(v) => set({ search: (v as string) || undefined, page: 1 })"
          />
        </UFormField>
      </div>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <div
        v-if="items.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        <template v-if="hasFilter">
          {{ $t('admin.staff.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.staff.empty.noStaff') }}
        </template>
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #name-cell="{ row }">
          <span class="font-medium">{{ fullName(row.original) }}</span>
          <UBadge
            v-if="isSelf(row.original)"
            class="ml-2"
            color="primary"
            variant="subtle"
          >
            {{ $t('admin.staff.badges.you') }}
          </UBadge>
        </template>
        <template #email-cell="{ row }">
          <span class="text-sm">{{ row.original.email }}</span>
          <UBadge
            v-if="!row.original.is_verified"
            class="ml-2"
            color="warning"
            variant="subtle"
          >
            {{ $t('admin.staff.badges.unverified') }}
          </UBadge>
        </template>
        <template #role-cell="{ row }">
          <UBadge
            :color="row.original.role === 'ADMIN' ? 'primary' : 'neutral'"
            variant="subtle"
          >
            {{
              row.original.role === 'ADMIN'
                ? $t('admin.staff.roles.admin')
                : $t('admin.staff.roles.customer')
            }}
          </UBadge>
        </template>
        <template #is_active-cell="{ row }">
          <UBadge
            :color="row.original.is_active ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{
              row.original.is_active
                ? $t('admin.staff.status.active')
                : $t('admin.staff.status.inactive')
            }}
          </UBadge>
        </template>
        <template #created_at-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.created_at) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.staff.actions.edit')"
              @click="openEdit(row.original)"
            />
          </div>
        </template>
      </UTable>

      <UPagination
        v-if="total > queryParams.pageSize"
        :total="total"
        :items-per-page="queryParams.pageSize"
        :page="queryParams.page"
        class="mt-4"
        @update:page="(p) => set({ page: p })"
      />

      <AdminStaffRoleDialog
        :open="dialogOpen"
        :member="editing"
        @update:open="(v) => (dialogOpen = v)"
      />
    </div>
  </NuxtLayout>
</template>
