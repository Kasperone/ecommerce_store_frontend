<script setup lang="ts">
/**
 * "Add section" preset picker.
 *
 * Lists every block type from the schema registry (`GET /blocks/schema`). Each
 * block exposes one or more **presets** — pre-filled section configs so the admin
 * starts from sensible defaults, not an empty form (Shopify OS-2.0 model). On
 * pick, emits a new `SectionInput` `{ type, settings }` (id is assigned by the
 * editor) ready to append to the draft.
 */
import { computed } from 'vue'
import type { BlockSchema } from '~/composables/queries/usePageQueries'

const props = defineProps<{
  open: boolean
  /** All block schemas from the registry. */
  schemas: BlockSchema[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  /** A chosen preset, normalised to a section input (no id yet). */
  'pick': [section: { type: string, settings: Record<string, unknown> }]
}>()

const { t } = useI18n()

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

interface PresetChoice {
  blockType: string
  blockName: string
  presetName: string
  settings: Record<string, unknown>
}

/** Flatten block → preset list; a block with no presets still offers an empty one. */
const choices = computed<PresetChoice[]>(() =>
  props.schemas.flatMap((b) => {
    const presets = b.presets?.length ? b.presets : [{ name: b.name, settings: {} }]
    return presets.map(p => ({
      blockType: b.type,
      blockName: b.name,
      presetName: p.name,
      settings: { ...(p.settings ?? {}) },
    }))
  }),
)

function pick(choice: PresetChoice) {
  emit('pick', { type: choice.blockType, settings: { ...choice.settings } })
  openModel.value = false
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="t('admin.cms.addSection.title')"
    :description="t('admin.cms.addSection.subtitle')"
  >
    <template #body>
      <ul
        class="grid grid-cols-1 sm:grid-cols-2 gap-2"
        :aria-label="t('admin.cms.addSection.title')"
      >
        <li
          v-for="choice in choices"
          :key="`${choice.blockType}-${choice.presetName}`"
        >
          <button
            type="button"
            class="w-full text-left rounded-md border border-default p-3 hover:bg-elevated hover:border-primary transition-colors"
            @click="pick(choice)"
          >
            <span class="font-medium block">{{ choice.presetName }}</span>
            <span class="text-muted text-xs">{{ choice.blockName }}</span>
          </button>
        </li>
      </ul>
    </template>
  </UModal>
</template>
