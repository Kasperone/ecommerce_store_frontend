<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  PriceListListItem,
  PriceListResponse,
} from '~/composables/queries/usePriceListQueries'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
useHead({ title: () => t('admin.priceLists.title') })

const page = ref(1)
const pageSize = 20

const { data: pageData, error: listError } = usePriceListsQuery(() => ({
  page: page.value,
  pageSize,
}))

const items = computed<PriceListListItem[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)

const modalOpen = ref(false)
function openCreate() {
  modalOpen.value = true
}

function onSaved(list: PriceListResponse) {
  // Jump straight to the detail so the admin can add entries.
  void navigateTo(localePath(`/admin/price-lists/${list.id}`))
}

const deletePriceList = useDeletePriceList()
async function onDelete(row: PriceListListItem) {
  if (!confirm(t('admin.priceLists.confirmDelete', { name: row.name }))) return
  try {
    await deletePriceList.mutateAsync(row.id)
    toast.add({
      title: t('admin.priceLists.flashes.deleted'),
      color: 'success',
      icon: 'i-lucide-check',
    })
  }
  catch (err) {
    toast.add({
      title: parseProblem(err)?.detail ?? t('admin.priceLists.flashes.deleteError'),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
}

const columns: TableColumn<PriceListListItem>[] = [
  { accessorKey: 'name', header: () => t('admin.priceLists.fields.name') },
  { accessorKey: 'is_active', header: () => t('admin.priceLists.fields.status') },
  { accessorKey: 'entry_count', header: () => t('admin.priceLists.fields.entries') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.priceLists.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.priceLists.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          data-testid="price-list-create"
          @click="openCreate"
        >
          {{ $t('admin.priceLists.actions.create') }}
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
        {{ $t('admin.priceLists.empty') }}
      </div>

      <UTable
        v-else
        :data="items"
        :columns="columns"
        :ui="{ td: 'align-middle' }"
      >
        <template #name-cell="{ row }">
          <ULink
            :to="localePath(`/admin/price-lists/${row.original.id}`)"
            class="font-medium text-primary"
          >
            {{ row.original.name }}
          </ULink>
        </template>
        <template #is_active-cell="{ row }">
          <UBadge
            :color="row.original.is_active ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{ row.original.is_active
              ? $t('admin.priceLists.status.active')
              : $t('admin.priceLists.status.inactive') }}
          </UBadge>
        </template>
        <template #entry_count-cell="{ row }">
          {{ row.original.entry_count }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="sm"
              :aria-label="$t('admin.priceLists.actions.edit')"
              :to="localePath(`/admin/price-lists/${row.original.id}`)"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="sm"
              :aria-label="$t('admin.priceLists.actions.delete')"
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

      <AdminPriceListFormModal
        v-model:open="modalOpen"
        :price-list="null"
        @saved="onSaved"
      />
    </div>
  </NuxtLayout>
</template>
