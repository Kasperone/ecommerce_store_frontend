<script setup lang="ts">
import { parseProblem } from '#shared/utils/problemDetails'
import type {
  CollectionResponse,
  CollectionWithProductCount,
} from '#shared/types/api'
import type { CollectionFormSubmit } from '~/components/admin/CollectionFormModal.vue'
import type { MemberRow } from '~/components/admin/CollectionMembershipEditor.vue'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.collections.title') })

const { data: collections, error: listError } = useCollectionsQuery()

const list = computed<CollectionWithProductCount[]>(() => collections.value ?? [])

// Modal state.
const creating = ref(false)
const editing = ref<CollectionWithProductCount | null>(null)
const deleting = ref<CollectionWithProductCount | null>(null)
const modalError = ref<unknown>(null)

const createMutation = useCreateCollection()
const updateMutation = useUpdateCollection()
const deleteMutation = useDeleteCollection()
const setProductsMutation = useSetCollectionProducts()
const uploadHeroMutation = useUploadCollectionHero()
const updateHeroAltMutation = useUpdateCollectionHeroAlt()
const deleteHeroMutation = useDeleteCollectionHero()

// Member products of the collection being edited — feeds the membership editor.
const editingId = computed(() => editing.value?.id)
const membersQuery = useCollectionProductsQuery(editingId)
const editingMembers = computed<MemberRow[]>(() =>
  (membersQuery.data.value ?? []).map(p => ({ id: p.id, name: p.name })),
)

const submitting = computed(() =>
  createMutation.isLoading.value
  || updateMutation.isLoading.value
  || setProductsMutation.isLoading.value
  || uploadHeroMutation.isLoading.value,
)

function buildBody(payload: CollectionFormSubmit) {
  return {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
    is_active: payload.is_active,
    sort_order: payload.sort_order,
    name_pl: payload.name_pl,
    slug_pl: payload.slug_pl,
    description_pl: payload.description_pl,
    meta_title: payload.meta_title,
    meta_description: payload.meta_description,
    meta_title_pl: payload.meta_title_pl,
    meta_description_pl: payload.meta_description_pl,
  }
}

async function uploadHeroIfStaged(id: number, heroFile: File | null, heroAlt: string) {
  if (!heroFile) return
  const formData = new FormData()
  formData.append('file', heroFile)
  await uploadHeroMutation.mutateAsync({ id, formData })
  if (heroAlt) {
    await updateHeroAltMutation.mutateAsync({ id, patch: { hero_image_alt: heroAlt } })
  }
}

async function onCreate(payload: CollectionFormSubmit) {
  modalError.value = null
  let createdId: number | null = null
  try {
    const created = await createMutation.mutateAsync({
      ...buildBody(payload),
      type: 'manual',
    })
    createdId = created.id
    await uploadHeroIfStaged(created.id, payload.heroFile, payload.heroAlt)
    creating.value = false
  }
  catch (err) {
    modalError.value = err
    if (createdId !== null) {
      try {
        await deleteMutation.mutateAsync(createdId)
      }
      catch {
        // Swallow — the user already sees the original error.
      }
    }
  }
}

async function onUpdate(payload: CollectionFormSubmit) {
  if (!editing.value) return
  const id = editing.value.id
  const existing = editing.value as Partial<CollectionResponse>
  const existingAlt = existing.hero_image_alt ?? ''
  const hasExistingHero = Boolean(existing.hero_image_url)
  modalError.value = null
  try {
    await updateMutation.mutateAsync({ id, patch: buildBody(payload) })
    // Membership — replace the whole ordered set.
    await setProductsMutation.mutateAsync({ id, productIds: payload.memberIds })
    if (payload.removeExistingHero && !payload.heroFile) {
      await deleteHeroMutation.mutateAsync(id)
    }
    await uploadHeroIfStaged(id, payload.heroFile, payload.heroAlt)
    if (
      !payload.heroFile
      && !payload.removeExistingHero
      && hasExistingHero
      && payload.heroAlt !== existingAlt
    ) {
      await updateHeroAltMutation.mutateAsync({
        id,
        patch: { hero_image_alt: payload.heroAlt || null },
      })
    }
    editing.value = null
  }
  catch (err) {
    modalError.value = err
  }
}

async function onToggleActive(collection: CollectionWithProductCount) {
  try {
    await updateMutation.mutateAsync({
      id: collection.id,
      patch: { is_active: !collection.is_active },
    })
  }
  catch {
    // Surfaced via the list error region on next refetch; non-blocking.
  }
}

async function onDelete(id: number) {
  modalError.value = null
  try {
    await deleteMutation.mutateAsync(id)
    deleting.value = null
  }
  catch (err) {
    modalError.value = err
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.collections.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.collections.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="creating = true; modalError = null"
        >
          {{ $t('admin.collections.actions.create') }}
        </UButton>
      </header>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />

      <ClientOnly>
        <div
          v-if="list.length === 0"
          class="text-muted text-sm py-12 text-center"
        >
          {{ $t('admin.collections.empty.noCollections') }}
        </div>

        <ul
          v-else
          class="border border-default rounded-lg divide-y divide-default"
          data-collections-list
        >
          <li
            v-for="collection in list"
            :key="collection.id"
            class="flex items-center gap-4 px-4 py-3"
          >
            <div class="size-12 shrink-0 rounded-md overflow-hidden bg-elevated flex items-center justify-center">
              <img
                v-if="collection.hero_image_url"
                :src="collection.hero_image_url"
                :alt="collection.hero_image_alt ?? collection.name"
                class="w-full h-full object-cover"
              >
              <UIcon
                v-else
                name="i-lucide-layers"
                class="size-5 text-muted"
              />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium truncate">{{ collection.name }}</span>
                <UBadge
                  :color="collection.is_active ? 'success' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ collection.is_active
                    ? $t('admin.collections.status.active')
                    : $t('admin.collections.status.inactive') }}
                </UBadge>
              </div>
              <p class="text-muted text-xs truncate">
                /{{ collection.slug }} ·
                {{ $t('admin.collections.productCount', { count: collection.product_count }, collection.product_count) }} ·
                {{ $t('admin.collections.fields.sortOrder') }} {{ collection.sort_order }}
              </p>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :label="collection.is_active
                  ? $t('admin.collections.actions.deactivate')
                  : $t('admin.collections.actions.activate')"
                :disabled="updateMutation.isLoading.value"
                @click="onToggleActive(collection)"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                :aria-label="$t('admin.collections.actions.edit')"
                @click="editing = collection; modalError = null"
              />
              <UButton
                size="xs"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                :aria-label="$t('admin.collections.actions.delete')"
                @click="deleting = collection; modalError = null"
              />
            </div>
          </li>
        </ul>
      </ClientOnly>

      <AdminCollectionFormModal
        :open="creating"
        :collection="null"
        :loading="submitting"
        :error="modalError"
        @update:open="(v) => { creating = v; if (!v) modalError = null }"
        @submit="onCreate"
        @cancel="creating = false"
      />

      <AdminCollectionFormModal
        :open="editing !== null"
        :collection="editing"
        :members="editingMembers"
        :loading="submitting"
        :error="modalError"
        @update:open="(v) => { if (!v) editing = null; modalError = null }"
        @submit="onUpdate"
        @cancel="editing = null"
      />

      <AdminCollectionDeleteConfirm
        :open="deleting !== null"
        :collection="deleting"
        :loading="deleteMutation.isLoading.value"
        @update:open="(v) => { if (!v) deleting = null }"
        @confirm="onDelete"
        @cancel="deleting = null"
      />
    </div>
  </NuxtLayout>
</template>
