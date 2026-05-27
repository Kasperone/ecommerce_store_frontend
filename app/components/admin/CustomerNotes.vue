<script setup lang="ts">
import type { CustomerNoteResponse } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

const props = defineProps<{ customerId: number }>()

const { t } = useI18n()
const toast = useToast()

const { data: notes, isLoading, error: loadError } = useCustomerNotesQuery(() => props.customerId)
const createMutation = useCreateNote()
const updateMutation = useUpdateNote()
const deleteMutation = useDeleteNote()

const newBody = ref('')
const editingId = ref<number | null>(null)
const editBody = ref('')
const formError = ref<ProblemDetails | null>(null)

const busy = computed(() =>
  createMutation.isLoading.value || updateMutation.isLoading.value || deleteMutation.isLoading.value,
)

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

async function onAdd() {
  const body = newBody.value.trim()
  if (!body) return
  formError.value = null
  try {
    await createMutation.mutateAsync({ customerId: props.customerId, body: { body } })
    newBody.value = ''
    toast.add({ title: t('admin.customers.notes.flashes.added'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}

function startEdit(note: CustomerNoteResponse) {
  editingId.value = note.id
  editBody.value = note.body
}
function cancelEdit() {
  editingId.value = null
  editBody.value = ''
}

async function onSaveEdit(noteId: number) {
  const body = editBody.value.trim()
  if (!body) return
  formError.value = null
  try {
    await updateMutation.mutateAsync({ customerId: props.customerId, noteId, body: { body } })
    cancelEdit()
    toast.add({ title: t('admin.customers.notes.flashes.updated'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}

async function onDelete(noteId: number) {
  formError.value = null
  try {
    await deleteMutation.mutateAsync({ customerId: props.customerId, noteId })
    toast.add({ title: t('admin.customers.notes.flashes.deleted'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        {{ $t('admin.customers.notes.title') }}
      </h2>
    </template>

    <ErrorAlert
      v-if="formError"
      :problem="formError"
      class="mb-4"
    />

    <!-- Add a note -->
    <div class="space-y-2 mb-4">
      <UTextarea
        v-model="newBody"
        :rows="2"
        :placeholder="$t('admin.customers.notes.placeholder')"
        :aria-label="$t('admin.customers.notes.add')"
        :disabled="busy"
        class="w-full"
      />
      <div class="flex justify-end">
        <UButton
          icon="i-lucide-plus"
          :label="$t('admin.customers.notes.add')"
          :disabled="busy || !newBody.trim()"
          @click="onAdd"
        />
      </div>
    </div>

    <!-- List -->
    <div
      v-if="isLoading"
      class="text-muted text-sm py-4 text-center"
    >
      {{ $t('admin.customers.notes.loading') }}
    </div>
    <ErrorAlert
      v-else-if="loadError"
      :problem="parseProblem(loadError)"
    />
    <p
      v-else-if="!notes || notes.length === 0"
      class="text-muted text-sm"
    >
      {{ $t('admin.customers.notes.empty') }}
    </p>
    <ul
      v-else
      class="space-y-3"
    >
      <li
        v-for="note in notes"
        :key="note.id"
        class="border-b border-default pb-3 last:border-0 last:pb-0"
      >
        <!-- Editing -->
        <div
          v-if="editingId === note.id"
          class="space-y-2"
        >
          <UTextarea
            v-model="editBody"
            :rows="2"
            :aria-label="$t('admin.customers.notes.edit')"
            :disabled="busy"
            class="w-full"
          />
          <div class="flex gap-2 justify-end">
            <UButton
              variant="ghost"
              color="neutral"
              :label="$t('admin.customers.notes.cancel')"
              :disabled="busy"
              @click="cancelEdit"
            />
            <UButton
              :label="$t('admin.customers.notes.save')"
              :disabled="busy || !editBody.trim()"
              @click="onSaveEdit(note.id)"
            />
          </div>
        </div>

        <!-- Display -->
        <div v-else>
          <p class="text-sm whitespace-pre-wrap">
            {{ note.body }}
          </p>
          <div class="flex items-center justify-between mt-1 gap-2">
            <span class="text-muted text-xs">
              {{ note.author_name }} · {{ formatDate(note.created_at) }}
            </span>
            <div class="flex gap-1 shrink-0">
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-pencil"
                :aria-label="$t('admin.customers.notes.edit')"
                :disabled="busy"
                @click="startEdit(note)"
              />
              <UPopover>
                <UButton
                  variant="ghost"
                  color="error"
                  size="xs"
                  icon="i-lucide-trash-2"
                  :aria-label="$t('admin.customers.notes.delete')"
                  :disabled="busy"
                />
                <template #content>
                  <div class="p-3 space-y-2 max-w-xs">
                    <p class="text-sm">
                      {{ $t('admin.customers.notes.deleteConfirm') }}
                    </p>
                    <div class="flex justify-end">
                      <UButton
                        color="error"
                        size="xs"
                        :label="$t('admin.customers.notes.delete')"
                        :disabled="busy"
                        @click="onDelete(note.id)"
                      />
                    </div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </UCard>
</template>
