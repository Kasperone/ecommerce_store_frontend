<script setup lang="ts">
import type { TagChip } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

const props = defineProps<{ customerId: number, tags: TagChip[] }>()

const { t } = useI18n()
const toast = useToast()

const { data: vocabulary } = useTagsQuery()
const attachMutation = useAttachTag()
const detachMutation = useDetachTag()

const newTag = ref('')
const formError = ref<ProblemDetails | null>(null)

const busy = computed(() => attachMutation.isLoading.value || detachMutation.isLoading.value)

// Vocabulary tags not already on this customer — offered as one-click pills.
const assignedIds = computed(() => new Set(props.tags.map(t => t.id)))
const available = computed(() =>
  (vocabulary.value ?? []).filter(t => !assignedIds.value.has(t.id)),
)

async function attach(body: { tag_id: number } | { name: string }) {
  formError.value = null
  try {
    await attachMutation.mutateAsync({ customerId: props.customerId, body })
  }
  catch (err) {
    formError.value = parseProblem(err)
  }
}

function onAttachExisting(tagId: number) {
  void attach({ tag_id: tagId })
}

async function onAddByName() {
  const name = newTag.value.trim()
  if (!name) return
  await attach({ name })
  if (!formError.value) {
    newTag.value = ''
  }
}

async function onDetach(tagId: number) {
  formError.value = null
  try {
    await detachMutation.mutateAsync({ customerId: props.customerId, tagId })
    toast.add({ title: t('admin.customers.tags.flashes.removed'), color: 'success', icon: 'i-lucide-check' })
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
        {{ $t('admin.customers.tags.title') }}
      </h2>
    </template>

    <ErrorAlert
      v-if="formError"
      :problem="formError"
      class="mb-4"
    />

    <!-- Assigned -->
    <div class="flex flex-wrap gap-1.5 min-h-6">
      <AdminTagPill
        v-for="tag in tags"
        :key="tag.id"
        :tag="tag"
        removable
        @remove="onDetach(tag.id)"
      />
      <span
        v-if="tags.length === 0"
        class="text-muted text-sm"
      >
        {{ $t('admin.customers.tags.empty') }}
      </span>
    </div>

    <!-- Pick an existing tag -->
    <div
      v-if="available.length > 0"
      class="mt-4"
    >
      <p class="text-muted text-xs uppercase tracking-wide mb-1.5">
        {{ $t('admin.customers.tags.addExisting') }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="tag in available"
          :key="tag.id"
          type="button"
          class="hover:opacity-80 disabled:opacity-50"
          :disabled="busy"
          @click="onAttachExisting(tag.id)"
        >
          <AdminTagPill :tag="tag" />
        </button>
      </div>
    </div>

    <!-- Create + assign a new tag -->
    <div class="mt-4 flex gap-2">
      <UInput
        v-model="newTag"
        :placeholder="$t('admin.customers.tags.newPlaceholder')"
        :aria-label="$t('admin.customers.tags.newPlaceholder')"
        :disabled="busy"
        class="flex-1"
        @keydown.enter.prevent="onAddByName"
      />
      <UButton
        icon="i-lucide-plus"
        :label="$t('admin.customers.tags.add')"
        :disabled="busy || !newTag.trim()"
        @click="onAddByName"
      />
    </div>
  </UCard>
</template>
