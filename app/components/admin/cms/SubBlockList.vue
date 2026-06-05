<script setup lang="ts">
/**
 * Nested sub-block editor for container sections (slideshow → slide,
 * faq → faq-item, image-gallery → image, collection-list → tile).
 *
 * Renders below the parent section's settings form. A `vuedraggable` list
 * mirrors `AdminCmsSectionList`'s add / remove / reorder / move affordances for
 * children, and the expanded (selected) child reuses `AdminCmsSettingsForm` to
 * edit its `settings` against the child schema.
 *
 * Child selection is LOCAL to this component (`selectedChildId` prop is the
 * single source of truth, driven by the parent's `@select`); it deliberately
 * does not live in the page-level editor state.
 */
import draggable from 'vuedraggable'
import type { ChildBlockDraft } from '~/composables/usePageEditorState'
import type { BlockChildSchema } from '~/composables/queries/usePageQueries'

const props = defineProps<{
  /** The selected section's children (each carries a stable string `id`). */
  modelValue: ChildBlockDraft[]
  /** The parent schema's child-type map (child `type` → schema). */
  childSchemas: Record<string, BlockChildSchema>
  /** The currently expanded child's id (local sub-editor selection). */
  selectedChildId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ChildBlockDraft[]]
  'add': [childType: string]
  'select': [id: string]
  'remove': [id: string]
  'move': [payload: { id: string, direction: 'up' | 'down' }]
  'reorder': [orderedIds: string[]]
}>()

const { t } = useI18n()

/** The available child types (keys of the parent's `blocks` map). */
const childTypes = computed(() => Object.keys(props.childSchemas))

/** The single child type for our 4 container blocks (each has exactly one). */
const defaultChildType = computed(() => childTypes.value[0] ?? '')

const list = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit('update:modelValue', value)
    emit('reorder', value.map(c => c.id))
  },
})

/** Plural header label ("Slides" / "Questions" / "Images" / "Tiles"). */
const headerLabel = computed(() => {
  const type = defaultChildType.value
  const count = props.modelValue.length
  // i18n owns the pluralization (incl. PL 4-form via plPlural); the schema name
  // is the English-singular fallback when a child type has no dedicated string.
  const schema = props.childSchemas[type]
  return t(
    `admin.cms.subBlocks.header.${type}`,
    count,
    { default: schema?.name ?? type },
  )
})

function childName(child: ChildBlockDraft): string {
  return props.childSchemas[child.type]?.name ?? child.type
}

/** A short preview drawn from common child settings (heading / image / etc.). */
function previewLabel(child: ChildBlockDraft): string {
  const s = child.settings as Record<string, unknown>
  const candidate = s.heading ?? s.question ?? s.title ?? s.heading_text ?? s.alt ?? s.image_url
  return typeof candidate === 'string' && candidate.trim() ? candidate : ''
}

function settingsFor(child: ChildBlockDraft) {
  return props.childSchemas[child.type]?.settings ?? []
}

function onChildSettingsUpdate(child: ChildBlockDraft, settings: Record<string, unknown>) {
  const next = props.modelValue.map(c =>
    c.id === child.id ? { ...c, settings } : c,
  )
  emit('update:modelValue', next)
}

function onAdd() {
  if (defaultChildType.value) emit('add', defaultChildType.value)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold text-xs uppercase text-muted tracking-wide">
        {{ headerLabel }}
      </h3>
      <UButton
        color="primary"
        variant="soft"
        size="xs"
        icon="i-lucide-plus"
        data-testid="sub-block-add"
        @click="onAdd"
      >
        {{ t('admin.cms.subBlocks.add') }}
      </UButton>
    </div>

    <draggable
      v-model="list"
      item-key="id"
      handle=".cms-child-drag-handle"
      ghost-class="opacity-50"
      class="space-y-2"
      :aria-label="headerLabel"
      role="list"
    >
      <template #item="{ element, index }">
        <div
          role="listitem"
          class="rounded-md border transition-colors"
          :class="element.id === selectedChildId ? 'border-primary bg-elevated' : 'border-default'"
          :data-testid="`sub-block-row-${index}`"
        >
          <div class="flex items-center gap-2 p-2">
            <button
              type="button"
              class="cms-child-drag-handle cursor-grab text-muted hover:text-default shrink-0"
              :aria-label="t('admin.cms.subBlocks.dragHandle')"
              tabindex="-1"
            >
              <UIcon
                name="i-lucide-grip-vertical"
                class="size-4"
              />
            </button>

            <button
              type="button"
              class="flex-1 min-w-0 text-left"
              @click="emit('select', element.id)"
            >
              <span class="font-medium text-sm block truncate">{{ childName(element) }}</span>
              <span
                v-if="previewLabel(element)"
                class="text-muted text-xs block truncate"
              >{{ previewLabel(element) }}</span>
            </button>

            <div class="flex items-center gap-0.5 shrink-0">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-chevron-up"
                :disabled="index === 0"
                :aria-label="t('admin.cms.subBlocks.moveUp')"
                @click="emit('move', { id: element.id, direction: 'up' })"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-chevron-down"
                :disabled="index === modelValue.length - 1"
                :aria-label="t('admin.cms.subBlocks.moveDown')"
                @click="emit('move', { id: element.id, direction: 'down' })"
              />
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash-2"
                :aria-label="t('admin.cms.subBlocks.remove')"
                @click="emit('remove', element.id)"
              />
            </div>
          </div>

          <!-- Expanded settings form for the selected child. -->
          <div
            v-if="element.id === selectedChildId"
            class="border-t border-default p-3"
            :data-testid="`sub-block-settings-${index}`"
          >
            <AdminCmsSettingsForm
              :fields="settingsFor(element)"
              :model-value="element.settings"
              @update:model-value="(s) => onChildSettingsUpdate(element, s)"
            />
          </div>
        </div>
      </template>
    </draggable>

    <p
      v-if="modelValue.length === 0"
      class="text-muted text-sm py-4 text-center rounded-md border border-dashed border-default"
    >
      {{ t('admin.cms.subBlocks.empty') }}
    </p>
  </div>
</template>
