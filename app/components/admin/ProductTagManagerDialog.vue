<script setup lang="ts">
import type { ProductTagResponse } from '#shared/types/api'

/**
 * Product-tag vocabulary manager — rename / recolor / delete with usage counts.
 *
 * Mirrors `AdminTagManagerDialog` (the customer-tag manager) but drives the
 * PRODUCT-tag vocabulary. Errors surface via the gold-standard message + toast
 * flow (`useValidatedForm(ref(null))` — no validatable field form here, just
 * action buttons).
 */

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { t } = useI18n()
const toast = useToast()

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

// Preset chip colors; null = neutral default.
const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280']

const { data: tags, isLoading } = useProductTagsQuery()
const createMutation = useCreateProductTag()
const updateMutation = useUpdateProductTag()
const deleteMutation = useDeleteProductTag()

const newName = ref('')
const newColor = ref<string | null>(null)
const editingId = ref<number | null>(null)
const editName = ref('')
const editColor = ref<string | null>(null)

const { errorMessage, applyApiError } = useValidatedForm(ref(null), {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

const busy = computed(() =>
  createMutation.isLoading.value || updateMutation.isLoading.value || deleteMutation.isLoading.value,
)

async function onCreate() {
  const name = newName.value.trim()
  if (!name) return
  errorMessage.value = ''
  try {
    await createMutation.mutateAsync({ name, color: newColor.value })
    newName.value = ''
    newColor.value = null
    toast.add({ title: t('admin.productTags.flashes.created'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    applyApiError(err, t('admin.productTags.errors.saveFallback'))
  }
}

function startEdit(tag: ProductTagResponse) {
  editingId.value = tag.id
  editName.value = tag.name
  editColor.value = tag.color ?? null
}
function cancelEdit() {
  editingId.value = null
}

async function onSaveEdit(id: number) {
  const name = editName.value.trim()
  if (!name) return
  errorMessage.value = ''
  try {
    await updateMutation.mutateAsync({ id, patch: { name, color: editColor.value } })
    cancelEdit()
    toast.add({ title: t('admin.productTags.flashes.updated'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    applyApiError(err, t('admin.productTags.errors.saveFallback'))
  }
}

async function onDelete(id: number) {
  errorMessage.value = ''
  try {
    await deleteMutation.mutateAsync(id)
    toast.add({ title: t('admin.productTags.flashes.deleted'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    applyApiError(err, t('admin.productTags.errors.saveFallback'))
  }
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="$t('admin.productTags.manage.title')"
    :description="$t('admin.productTags.manage.description')"
  >
    <template #body>
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        class="mb-4"
        :title="t('messages.saveErrorTitle')"
        :description="errorMessage"
        :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
        @close="errorMessage = ''"
      />

      <!-- Create -->
      <div class="space-y-2 pb-4 border-b border-default">
        <div class="flex gap-2">
          <UInput
            v-model="newName"
            :placeholder="$t('admin.productTags.manage.namePlaceholder')"
            :aria-label="$t('admin.productTags.manage.namePlaceholder')"
            :disabled="busy"
            class="flex-1"
            @keydown.enter.prevent="onCreate"
          />
          <UButton
            icon="i-lucide-plus"
            :label="$t('admin.productTags.manage.create')"
            :disabled="busy || !newName.trim()"
            @click="onCreate"
          />
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-muted text-xs mr-1">{{ $t('admin.productTags.manage.color') }}</span>
          <button
            type="button"
            class="size-5 rounded-full border-2 flex items-center justify-center"
            :class="newColor === null ? 'border-primary' : 'border-default'"
            :aria-label="$t('admin.productTags.manage.noColor')"
            @click="newColor = null"
          >
            <UIcon
              name="i-lucide-ban"
              class="size-3 text-muted"
            />
          </button>
          <button
            v-for="c in PALETTE"
            :key="c"
            type="button"
            class="size-5 rounded-full border-2"
            :class="newColor === c ? 'border-primary' : 'border-transparent'"
            :style="{ backgroundColor: c }"
            :aria-label="c"
            @click="newColor = c"
          />
        </div>
      </div>

      <!-- Existing tags -->
      <div
        v-if="isLoading"
        class="text-muted text-sm py-4 text-center"
      >
        {{ $t('admin.productTags.manage.loading') }}
      </div>
      <p
        v-else-if="!tags || tags.length === 0"
        class="text-muted text-sm py-4"
      >
        {{ $t('admin.productTags.manage.empty') }}
      </p>
      <ul
        v-else
        class="divide-y divide-default max-h-80 overflow-y-auto"
      >
        <li
          v-for="tag in tags"
          :key="tag.id"
          class="py-2"
        >
          <!-- Editing -->
          <div
            v-if="editingId === tag.id"
            class="space-y-2"
          >
            <div class="flex gap-2">
              <UInput
                v-model="editName"
                :aria-label="$t('admin.productTags.manage.namePlaceholder')"
                :disabled="busy"
                class="flex-1"
                @keydown.enter.prevent="onSaveEdit(tag.id)"
              />
              <UButton
                variant="ghost"
                color="neutral"
                :label="$t('admin.productTags.manage.cancel')"
                :disabled="busy"
                @click="cancelEdit"
              />
              <UButton
                :label="$t('admin.productTags.manage.save')"
                :disabled="busy || !editName.trim()"
                @click="onSaveEdit(tag.id)"
              />
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                class="size-5 rounded-full border-2 flex items-center justify-center"
                :class="editColor === null ? 'border-primary' : 'border-default'"
                :aria-label="$t('admin.productTags.manage.noColor')"
                @click="editColor = null"
              >
                <UIcon
                  name="i-lucide-ban"
                  class="size-3 text-muted"
                />
              </button>
              <button
                v-for="c in PALETTE"
                :key="c"
                type="button"
                class="size-5 rounded-full border-2"
                :class="editColor === c ? 'border-primary' : 'border-transparent'"
                :style="{ backgroundColor: c }"
                :aria-label="c"
                @click="editColor = c"
              />
            </div>
          </div>

          <!-- Display -->
          <div
            v-else
            class="flex items-center justify-between gap-2"
          >
            <AdminProductTagPill :tag="tag" />
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-muted text-xs">
                {{ $t('admin.productTags.manage.usage', { count: tag.usage_count }, tag.usage_count) }}
              </span>
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-pencil"
                :aria-label="$t('admin.productTags.manage.edit')"
                :disabled="busy"
                @click="startEdit(tag)"
              />
              <UPopover>
                <UButton
                  variant="ghost"
                  color="error"
                  size="xs"
                  icon="i-lucide-trash-2"
                  :aria-label="$t('admin.productTags.manage.delete')"
                  :disabled="busy"
                />
                <template #content>
                  <div class="p-3 space-y-2 max-w-xs">
                    <p class="text-sm">
                      {{ $t('admin.productTags.manage.deleteConfirm') }}
                    </p>
                    <div class="flex justify-end">
                      <UButton
                        color="error"
                        size="xs"
                        :label="$t('admin.productTags.manage.delete')"
                        :disabled="busy"
                        @click="onDelete(tag.id)"
                      />
                    </div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </li>
      </ul>
    </template>

    <template #footer>
      <div class="flex justify-end w-full">
        <UButton
          color="neutral"
          variant="soft"
          :label="$t('admin.productTags.manage.close')"
          @click="() => { openModel = false }"
        />
      </div>
    </template>
  </UModal>
</template>
