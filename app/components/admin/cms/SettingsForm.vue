<script setup lang="ts">
/**
 * Schema → form: renders one Nuxt UI control per setting in a block's declarative
 * schema (the Shopify-style registry served by `GET /blocks/schema`).
 *
 * Control registry (setting `type` → control):
 *   text         → UInput
 *   textarea     → UTextarea
 *   richtext     → RichTextEditor (lazy-loaded TipTap WYSIWYG; allowlist-safe HTML)
 *   url          → UInput type=url
 *   image_picker → ImagePicker (R2 upload widget + manual paste-URL fallback)
 *   range        → UInputNumber (min/max/step honoured)
 *   number       → UInputNumber
 *   select       → USelect (from schema `options`)
 *   checkbox     → USwitch
 *   color        → native colour input + hex UInput
 *   datetime     → UInput type=datetime-local (ISO round-trip)
 *   product      → ProductPicker (Meilisearch autocomplete → product id / id[])
 *   collection   → ProductPicker (Meilisearch autocomplete → category slug)
 *   <unknown>    → JSON UTextarea fallback (never crashes on a new backend type)
 *
 * The form is uncontrolled-per-field: it reads from / writes to a `settings`
 * record via `v-model`, mutating a shallow copy so the parent can diff for the
 * unsaved-changes badge.
 */
import { computed } from 'vue'
import type { BlockSettingSchema } from '~/composables/queries/usePageQueries'

const props = defineProps<{
  /** The setting descriptors for the selected block/section. */
  fields: BlockSettingSchema[]
  /** The current settings record (mutated via update:modelValue). */
  modelValue: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const { t } = useI18n()

function setField(id: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [id]: value })
}

/** Read a field's value, falling back to its schema default then a type-safe blank. */
function valueOf(field: BlockSettingSchema): unknown {
  const v = props.modelValue[field.id]
  if (v !== undefined && v !== null) return v
  return field.default ?? undefined
}

function strValue(field: BlockSettingSchema): string {
  const v = valueOf(field)
  return v == null ? '' : String(v)
}

function numValue(field: BlockSettingSchema): number | null {
  const v = valueOf(field)
  return typeof v === 'number' ? v : (v == null ? null : Number(v) || null)
}

function boolValue(field: BlockSettingSchema): boolean {
  return valueOf(field) === true
}

/** ISO ↔ `datetime-local` round-trip (mirrors BannerFormModal). */
function toLocalInput(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** JSON fallback text for unknown control types. */
function jsonValue(field: BlockSettingSchema): string {
  const v = props.modelValue[field.id] ?? field.default
  if (v === undefined) return ''
  try {
    return JSON.stringify(v, null, 2)
  }
  catch {
    return String(v)
  }
}
function setJson(id: string, raw: string) {
  if (!raw.trim()) {
    setField(id, null)
    return
  }
  try {
    setField(id, JSON.parse(raw))
  }
  catch {
    // Keep the raw string so the admin can fix invalid JSON without losing it.
    setField(id, raw)
  }
}

const KNOWN_TYPES = new Set([
  'text', 'textarea', 'richtext', 'url', 'image_picker', 'range', 'number',
  'select', 'checkbox', 'color', 'datetime', 'product', 'collection',
])

function isKnown(field: BlockSettingSchema): boolean {
  return KNOWN_TYPES.has(field.type)
}

const selectItemsFor = (field: BlockSettingSchema) =>
  (field.options ?? []).map(o => ({ label: o.label, value: o.value }))

const hasFields = computed(() => props.fields.length > 0)
</script>

<template>
  <div
    v-if="hasFields"
    class="space-y-4"
  >
    <UFormField
      v-for="field in fields"
      :key="field.id"
      :label="field.label"
      :help="field.info"
      :name="field.id"
    >
      <!-- text -->
      <UInput
        v-if="field.type === 'text'"
        :id="`setting-${field.id}`"
        :model-value="strValue(field)"
        class="w-full"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- url -->
      <UInput
        v-else-if="field.type === 'url'"
        :id="`setting-${field.id}`"
        :model-value="strValue(field)"
        type="url"
        class="w-full"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- image_picker → R2 upload widget + manual URL fallback -->
      <AdminCmsImagePicker
        v-else-if="field.type === 'image_picker'"
        :field-id="field.id"
        :model-value="strValue(field)"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- richtext → lazy-loaded TipTap WYSIWYG (admin-only, code-split) -->
      <LazyAdminCmsRichTextEditor
        v-else-if="field.type === 'richtext'"
        :field-id="field.id"
        :model-value="strValue(field)"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- textarea (plain HTML / text source) -->
      <UTextarea
        v-else-if="field.type === 'textarea'"
        :id="`setting-${field.id}`"
        :model-value="strValue(field)"
        :rows="3"
        class="w-full font-mono text-sm"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- range / number -->
      <UInputNumber
        v-else-if="field.type === 'range' || field.type === 'number'"
        :id="`setting-${field.id}`"
        :model-value="numValue(field)"
        :min="field.min"
        :max="field.max"
        :step="field.step ?? 1"
        class="w-full"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- select -->
      <USelect
        v-else-if="field.type === 'select'"
        :id="`setting-${field.id}`"
        :model-value="strValue(field)"
        :items="selectItemsFor(field)"
        value-key="value"
        class="w-full"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- checkbox → switch -->
      <USwitch
        v-else-if="field.type === 'checkbox'"
        :model-value="boolValue(field)"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- color -->
      <div
        v-else-if="field.type === 'color'"
        class="flex items-center gap-2"
      >
        <input
          :id="`setting-${field.id}`"
          type="color"
          :value="strValue(field) || '#000000'"
          class="h-9 w-12 rounded border border-default cursor-pointer bg-default"
          :aria-label="field.label"
          @input="(e) => setField(field.id, (e.target as HTMLInputElement).value)"
        >
        <UInput
          :model-value="strValue(field)"
          placeholder="#000000"
          class="w-32"
          @update:model-value="(v) => setField(field.id, v)"
        />
      </div>

      <!-- datetime -->
      <UInput
        v-else-if="field.type === 'datetime'"
        :id="`setting-${field.id}`"
        :model-value="toLocalInput(valueOf(field))"
        type="datetime-local"
        class="w-full"
        @update:model-value="(v) => setField(field.id, fromLocalInput(v as string))"
      />

      <!-- product / collection → Meilisearch picker -->
      <AdminCmsProductPicker
        v-else-if="field.type === 'product' || field.type === 'collection'"
        :id="`setting-${field.id}`"
        :mode="field.type"
        :multiple="field.multiple === true"
        :model-value="modelValue[field.id]"
        @update:model-value="(v) => setField(field.id, v)"
      />

      <!-- unknown type → JSON fallback (never crash) -->
      <template v-else>
        <UTextarea
          :id="`setting-${field.id}`"
          :model-value="jsonValue(field)"
          :rows="3"
          class="w-full font-mono text-sm"
          @update:model-value="(v) => setJson(field.id, v as string)"
        />
        <p class="text-muted text-xs mt-1">
          {{ t('admin.cms.controls.unknownType', { type: field.type }) }}
        </p>
      </template>
    </UFormField>
  </div>

  <p
    v-else
    class="text-muted text-sm"
  >
    {{ t('admin.cms.settings.noFields') }}
  </p>

  <!-- Hidden helper so the `isKnown` registry helper is reachable/testable. -->
  <span
    v-show="false"
    data-testid="settings-form-control-count"
  >{{ fields.filter(isKnown).length }}</span>
</template>
