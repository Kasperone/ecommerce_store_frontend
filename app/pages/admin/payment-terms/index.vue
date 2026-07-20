<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PaymentTermResponse } from '~/composables/queries/usePaymentTermQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t, locale } = useI18n()
const toast = useToast()
useHead({ title: () => t('admin.paymentTerms.title') })

const page = ref(1)
const pageSize = 20

const { data: pageData, error: listError } = usePaymentTermsQuery(() => ({
  page: page.value,
  pageSize,
}))

const items = computed<PaymentTermResponse[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)

const modalOpen = ref(false)
const editing = ref<PaymentTermResponse | null>(null)

function openCreate() {
  editing.value = null
  modalOpen.value = true
}
function openEdit(term: PaymentTermResponse) {
  editing.value = term
  modalOpen.value = true
}

const deleteTerm = useDeletePaymentTerm()
async function onDelete(row: PaymentTermResponse) {
  if (!confirm(t('admin.paymentTerms.confirmDelete', { name: row.name }))) return
  try {
    await deleteTerm.mutateAsync(row.id)
    toast.add({ title: t('admin.paymentTerms.flashes.deleted'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({
      title: parseProblem(err).detail ?? t('admin.paymentTerms.flashes.deleteError'),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
}

const columns: TableColumn<PaymentTermResponse>[] = [
  { accessorKey: 'name', header: () => t('admin.paymentTerms.fields.name') },
  { accessorKey: 'term_type', header: () => t('admin.paymentTerms.fields.type') },
  { id: 'due', header: () => t('admin.paymentTerms.fields.due') },
  { accessorKey: 'is_active', header: () => t('admin.paymentTerms.fields.status') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.paymentTerms.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.paymentTerms.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          data-testid="payment-term-create"
          @click="openCreate"
        >
          {{ $t('admin.paymentTerms.actions.create') }}
        </UButton>
      </header>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <div
        v-if="items.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        {{ $t('admin.paymentTerms.empty') }}
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #name-cell="{ row }">
          <button
            type="button"
            class="font-medium text-primary text-left"
            @click="openEdit(row.original)"
          >
            {{ row.original.name }}
          </button>
        </template>
        <template #term_type-cell="{ row }">
          {{ $t(`admin.paymentTerms.types.${row.original.term_type}`) }}
        </template>
        <template #due-cell="{ row }">
          {{ describeTermDue(row.original, t, locale) }}
        </template>
        <template #is_active-cell="{ row }">
          <UBadge
            :color="row.original.is_active ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{ row.original.is_active
              ? $t('admin.paymentTerms.status.active')
              : $t('admin.paymentTerms.status.inactive') }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.paymentTerms.actions.edit')"
              @click="openEdit(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :aria-label="$t('admin.paymentTerms.actions.delete')"
              @click="onDelete(row.original)"
            />
          </div>
        </template>
      </UTable>

      <UPagination
        v-if="total > pageSize"
        :total="total"
        :items-per-page="pageSize"
        :page="page"
        class="mt-4"
        @update:page="(p) => (page = p)"
      />

      <AdminPaymentTermFormModal
        v-model:open="modalOpen"
        :term="editing"
      />
    </div>
  </NuxtLayout>
</template>
