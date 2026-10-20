<script setup lang="ts">
import type { TagResponse } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

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

const { data: tags, isLoading } = useTagsQuery()
const createMutation = useCreateTag()
const updateMutation = useUpdateTag()
const deleteMutation = useDeleteTag()

const newName = ref('')
const newColor = ref<string | null>(null)
const editingId = ref<number | null>(null)
const editName = ref('')
const editColor = ref<string | null>(null)
const formError = ref<ProblemDetails | null>(null)

const busy = computed(() =>
  createMutation.isLoading.value || updateMutation.isLoading.value || deleteMutation.isLoading.value,
)

async function onCreate() {
  const name = newName.value.trim()
  if (!name) return
  formError.value = null
  try {
    await createMutation.mutateAsync({ name, color: newColor.value })
    newName.value = ''
    newColor.value = null
    toast.add({ title: t('admin.tags.flashes.created'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}

function startEdit(tag: TagResponse) {
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
  formError.value = null
  try {
    await updateMutation.mutateAsync({ id, patch: { name, color: editColor.value } })
    cancelEdit()
    toast.add({ title: t('admin.tags.flashes.updated'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}

async function onDelete(id: number) {
  formError.value = null
  try {
    await deleteMutation.mutateAsync(id)
    toast.add({ title: t('admin.tags.flashes.deleted'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="$t('admin.tags.manage.title')"
    :description="$t('admin.tags.manage.description')"
  >
    <template #body>
      <ErrorAlert
        v-if="formError"
        :problem="formError"
        class="mb-4"
      />

      <!-- Create -->
      <div class="space-y-2 pb-4 border-b border-default">
        <div class="flex gap-2">
          <UInput
            v-model="newName"
            :placeholder="$t('admin.tags.manage.namePlaceholder')"
            :aria-label="$t('admin.tags.manage.namePlaceholder')"
            :disabled="busy"
            class="flex-1"
            @keydown.enter.prevent="onCreate"
          />
          <UButton
            icon="i-lucide-plus"
            :label="$t('admin.tags.manage.create')"
            :disabled="busy || !newName.trim()"
            @click="onCreate"
          />
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-muted text-xs mr-1">{{ $t('admin.tags.manage.color') }}</span>
          <button
            type="button"
            class="size-5 rounded-full border-2 flex items-center justify-center"
            :class="newColor === null ? 'border-primary' : 'border-default'"
            :aria-label="$t('admin.tags.manage.noColor')"
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
        {{ $t('admin.tags.manage.loading') }}
      </div>
      <p
        v-else-if="!tags || tags.length === 0"
        class="text-muted text-sm py-4"
      >
        {{ $t('admin.tags.manage.empty') }}
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
                :aria-label="$t('admin.tags.manage.namePlaceholder')"
                :disabled="busy"
                class="flex-1"
                @keydown.enter.prevent="onSaveEdit(tag.id)"
              />
              <UButton
                variant="ghost"
                color="neutral"
                :label="$t('admin.tags.manage.cancel')"
                :disabled="busy"
                @click="cancelEdit"
              />
              <UButton
                :label="$t('admin.tags.manage.save')"
                :disabled="busy || !editName.trim()"
                @click="onSaveEdit(tag.id)"
              />
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                class="size-5 rounded-full border-2 flex items-center justify-center"
                :class="editColor === null ? 'border-primary' : 'border-default'"
                :aria-label="$t('admin.tags.manage.noColor')"
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
            <AdminTagPill :tag="tag" />
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-muted text-xs">
                {{ $t('admin.tags.manage.usage', { count: tag.usage_count }) }}
              </span>
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-pencil"
                :aria-label="$t('admin.tags.manage.edit')"
                :disabled="busy"
                @click="startEdit(tag)"
              />
              <UPopover>
                <UButton
                  variant="ghost"
                  color="error"
                  size="xs"
                  icon="i-lucide-trash-2"
                  :aria-label="$t('admin.tags.manage.delete')"
                  :disabled="busy"
                />
                <template #content>
                  <div class="p-3 space-y-2 max-w-xs">
                    <p class="text-sm">
                      {{ $t('admin.tags.manage.deleteConfirm') }}
                    </p>
                    <div class="flex justify-end">
                      <UButton
                        color="error"
                        size="xs"
                        :label="$t('admin.tags.manage.delete')"
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
          :label="$t('admin.tags.manage.close')"
          @click="() => { openModel = false }"
        />
      </div>
    </template>
  </UModal>
</template>
