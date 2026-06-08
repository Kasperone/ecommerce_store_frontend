<script setup lang="ts">
/**
 * Free-form product-tag editor for the product create/edit form.
 *
 * Bound (`v-model`) to a plain `string[]` of tag names. The product write
 * (`ProductCreate`/`ProductUpdate`) carries this array; the backend
 * get-or-creates each name and reconciles the join — so there is no per-tag
 * assignment call here. Mirrors the customer-tag assignment UX (chips + a
 * free-form add + one-click pills for the existing vocabulary) but uses the
 * PRODUCT-tag vocabulary and the visually-distinct `AdminProductTagPill`.
 *
 * A "Manage tags" affordance opens the vocabulary manager dialog
 * (rename/recolor/delete with usage counts).
 */

const model = defineModel<string[]>({ default: () => [] })

defineProps<{ disabled?: boolean }>()

const { data: vocabulary } = useProductTagsQuery()

const newTag = ref('')
const managerOpen = ref(false)

// Case-insensitive membership test against the current selection.
function hasTag(name: string): boolean {
  const lower = name.trim().toLowerCase()
  return model.value.some(t => t.toLowerCase() === lower)
}

// Vocabulary tags not yet on this product — offered as one-click pills.
const available = computed(() =>
  (vocabulary.value ?? []).filter(t => !hasTag(t.name)),
)

function addByName(raw: string) {
  const name = raw.trim()
  if (!name || hasTag(name)) return
  model.value = [...model.value, name]
}

function onAdd() {
  const name = newTag.value.trim()
  if (!name) return
  addByName(name)
  newTag.value = ''
}

function onRemove(name: string) {
  model.value = model.value.filter(t => t !== name)
}
</script>

<template>
  <div class="space-y-3">
    <!-- Selected tags -->
    <div
      class="flex flex-wrap gap-1.5 min-h-6"
      data-product-tag-chips
    >
      <AdminProductTagPill
        v-for="name in model"
        :key="name"
        :tag="{ name, color: vocabulary?.find(v => v.name.toLowerCase() === name.toLowerCase())?.color ?? null }"
        removable
        @remove="onRemove(name)"
      />
      <span
        v-if="model.length === 0"
        class="text-muted text-sm"
      >
        {{ $t('admin.productTags.empty') }}
      </span>
    </div>

    <!-- Existing vocabulary as one-click pills -->
    <div v-if="available.length > 0">
      <p class="text-muted text-xs uppercase tracking-wide mb-1.5">
        {{ $t('admin.productTags.addExisting') }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="tag in available"
          :key="tag.id"
          type="button"
          class="hover:opacity-80 disabled:opacity-50"
          :disabled="disabled"
          @click="addByName(tag.name)"
        >
          <AdminProductTagPill :tag="tag" />
        </button>
      </div>
    </div>

    <!-- Free-form add + manage affordance -->
    <div class="flex gap-2">
      <UInput
        v-model="newTag"
        :placeholder="$t('admin.productTags.newPlaceholder')"
        :aria-label="$t('admin.productTags.newPlaceholder')"
        :disabled="disabled"
        class="flex-1"
        data-product-tag-input
        @keydown.enter.prevent="onAdd"
      />
      <UButton
        icon="i-lucide-plus"
        :label="$t('admin.productTags.add')"
        :disabled="disabled || !newTag.trim()"
        @click="onAdd"
      />
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-settings-2"
        :label="$t('admin.productTags.manage.open')"
        :disabled="disabled"
        @click="managerOpen = true"
      />
    </div>

    <AdminProductTagManagerDialog v-model:open="managerOpen" />
  </div>
</template>
