<script setup lang="ts">
/**
 * CMS `richtext` control — a TipTap (ProseMirror) WYSIWYG editor that emits
 * allowlist-safe HTML.
 *
 * The `v-model` is the HTML string. The enabled marks/nodes are a deliberate
 * SUBSET of the backend nh3 allowlist (`_HTML_ALLOWED_TAGS` in
 * `admin_pages.py`) so a save → reload round-trip is stable — nothing the
 * editor produces is stripped on save:
 *
 *   bold     → <strong>   italic    → <em>        underline   → <u>
 *   heading  → <h1>..<h6>  paragraph → <p>         blockquote  → <blockquote>
 *   bullet   → <ul><li>    ordered   → <ol><li>     code        → <code>
 *   codeBlock→ <pre><code> hr        → <hr>         hardBreak   → <br>
 *   link     → <a href title target>   (rel is managed by nh3 itself)
 *
 * `strike` (<s>) is explicitly DISABLED because <s>/<strike> is NOT in the nh3
 * allowlist — enabling it would silently drop formatting on save. Everything
 * else StarterKit ships survives nh3.
 *
 * The backend nh3 sanitize at save remains the security boundary; this editor
 * is authoring convenience only. A "source" toggle exposes the raw-HTML
 * textarea for power users / debugging — the backend sanitizes regardless.
 *
 * This component is LAZY-LOADED (admin-only, TipTap is heavy) — see
 * `SettingsForm.vue`, which references it via the Nuxt `Lazy` prefix.
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { StarterKit } from '@tiptap/starter-kit'

const props = defineProps<{
  /** The control's DOM id (mirrors the other SettingsForm controls). */
  fieldId: string
  /** The current HTML string, or empty. */
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()

/** Whether the raw-HTML source textarea is shown instead of the WYSIWYG. */
const showSource = ref(false)

/**
 * The TipTap extension set. A strict subset of the nh3 allowlist:
 *  - StarterKit provides bold/italic/underline/heading/lists/blockquote/code/
 *    codeBlock/hr/hardBreak/paragraph/link (TipTap v3 folds link + underline in).
 *  - `strike` is disabled (<s> not allowlisted).
 *  - link is configured so its attributes (href/title/target) match the nh3
 *    `_HTML_ALLOWED_ATTRS["a"]`; nh3 manages `rel` itself.
 */
const extensions = [
  StarterKit.configure({
    strike: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      protocols: ['http', 'https', 'mailto', 'tel'],
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      },
    },
  }),
]

const editor = ref<Editor | null>(null)

if (import.meta.client) {
  editor.value = new Editor({
    content: props.modelValue || '',
    extensions,
    editorProps: {
      attributes: {
        'id': `setting-${props.fieldId}`,
        'class': 'prose prose-sm max-w-none focus:outline-none min-h-32 px-3 py-2',
        'aria-label': t('admin.cms.richText.contentLabel'),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML()
      if (html !== props.modelValue) emit('update:modelValue', html)
    },
  })
}

// Keep the editor in sync when the model changes from outside (e.g. switching
// sections, or edits made in the source textarea). Avoid clobbering the
// caret while the editor itself is the source of the change.
watch(
  () => props.modelValue,
  (value) => {
    const ed = editor.value
    if (!ed) return
    const current = ed.isEmpty ? '' : ed.getHTML()
    if (value !== current) ed.commands.setContent(value || '', { emitUpdate: false })
  },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function onSourceInput(value: string) {
  emit('update:modelValue', value)
}

/** Toolbar command helpers (guard against a not-yet-mounted editor). */
function chain() {
  return editor.value?.chain().focus()
}
const toggleBold = () => chain()?.toggleBold().run()
const toggleItalic = () => chain()?.toggleItalic().run()
const toggleUnderline = () => chain()?.toggleUnderline().run()
const toggleBulletList = () => chain()?.toggleBulletList().run()
const toggleOrderedList = () => chain()?.toggleOrderedList().run()
const toggleBlockquote = () => chain()?.toggleBlockquote().run()
const toggleCode = () => chain()?.toggleCode().run()
const setHr = () => chain()?.setHorizontalRule().run()
const toggleHeading = (level: 1 | 2 | 3 | 4 | 5 | 6) =>
  chain()?.toggleHeading({ level }).run()
const setParagraph = () => chain()?.setParagraph().run()

/** Insert/replace a link over the current selection (or unset if blank). */
function setLink() {
  const ed = editor.value
  if (!ed) return
  const previous = (ed.getAttributes('link').href as string) ?? ''

  const url = typeof window !== 'undefined' ? window.prompt(t('admin.cms.richText.linkPrompt'), previous) : previous
  if (url === null) return // cancelled
  if (url === '') {
    ed.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

/** Active-state helpers for toolbar button styling. */
function isActive(name: string, attrs?: Record<string, unknown>): boolean {
  return editor.value?.isActive(name, attrs) ?? false
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const
</script>

<template>
  <div class="rich-text-editor border border-default rounded-md bg-default">
    <!-- Toolbar -->
    <div
      class="flex flex-wrap items-center gap-0.5 border-b border-default p-1"
      role="toolbar"
      :aria-label="t('admin.cms.richText.toolbarLabel')"
    >
      <UButton
        type="button"
        size="xs"
        :color="isActive('bold') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-bold"
        :aria-label="t('admin.cms.richText.bold')"
        :title="t('admin.cms.richText.bold')"
        :disabled="showSource"
        @click="toggleBold"
      />
      <UButton
        type="button"
        size="xs"
        :color="isActive('italic') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-italic"
        :aria-label="t('admin.cms.richText.italic')"
        :title="t('admin.cms.richText.italic')"
        :disabled="showSource"
        @click="toggleItalic"
      />
      <UButton
        type="button"
        size="xs"
        :color="isActive('underline') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-underline"
        :aria-label="t('admin.cms.richText.underline')"
        :title="t('admin.cms.richText.underline')"
        :disabled="showSource"
        @click="toggleUnderline"
      />

      <span class="mx-1 h-5 w-px bg-default" />

      <UButton
        v-for="level in HEADING_LEVELS"
        :key="`h${level}`"
        type="button"
        size="xs"
        :color="isActive('heading', { level }) ? 'primary' : 'neutral'"
        variant="ghost"
        :aria-label="t('admin.cms.richText.heading', { level })"
        :title="t('admin.cms.richText.heading', { level })"
        :disabled="showSource"
        @click="toggleHeading(level)"
      >
        H{{ level }}
      </UButton>
      <UButton
        type="button"
        size="xs"
        :color="isActive('paragraph') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-pilcrow"
        :aria-label="t('admin.cms.richText.paragraph')"
        :title="t('admin.cms.richText.paragraph')"
        :disabled="showSource"
        @click="setParagraph"
      />

      <span class="mx-1 h-5 w-px bg-default" />

      <UButton
        type="button"
        size="xs"
        :color="isActive('bulletList') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-list"
        :aria-label="t('admin.cms.richText.bulletList')"
        :title="t('admin.cms.richText.bulletList')"
        :disabled="showSource"
        @click="toggleBulletList"
      />
      <UButton
        type="button"
        size="xs"
        :color="isActive('orderedList') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-list-ordered"
        :aria-label="t('admin.cms.richText.orderedList')"
        :title="t('admin.cms.richText.orderedList')"
        :disabled="showSource"
        @click="toggleOrderedList"
      />

      <span class="mx-1 h-5 w-px bg-default" />

      <UButton
        type="button"
        size="xs"
        :color="isActive('link') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-link"
        :aria-label="t('admin.cms.richText.link')"
        :title="t('admin.cms.richText.link')"
        :disabled="showSource"
        @click="setLink"
      />
      <UButton
        type="button"
        size="xs"
        :color="isActive('blockquote') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-quote"
        :aria-label="t('admin.cms.richText.blockquote')"
        :title="t('admin.cms.richText.blockquote')"
        :disabled="showSource"
        @click="toggleBlockquote"
      />
      <UButton
        type="button"
        size="xs"
        :color="isActive('code') ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-code"
        :aria-label="t('admin.cms.richText.code')"
        :title="t('admin.cms.richText.code')"
        :disabled="showSource"
        @click="toggleCode"
      />
      <UButton
        type="button"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-minus"
        :aria-label="t('admin.cms.richText.horizontalRule')"
        :title="t('admin.cms.richText.horizontalRule')"
        :disabled="showSource"
        @click="setHr"
      />

      <span class="ml-auto" />

      <UButton
        type="button"
        size="xs"
        :color="showSource ? 'primary' : 'neutral'"
        variant="ghost"
        icon="i-lucide-code-2"
        :aria-label="t('admin.cms.richText.sourceToggle')"
        :title="t('admin.cms.richText.sourceToggle')"
        @click="showSource = !showSource"
      >
        {{ t('admin.cms.richText.source') }}
      </UButton>
    </div>

    <!-- Source textarea (power-user / debugging) -->
    <UTextarea
      v-if="showSource"
      :id="`setting-${fieldId}-source`"
      :model-value="modelValue"
      :rows="6"
      class="w-full font-mono text-sm"
      :ui="{ base: 'rounded-none border-0 focus-visible:ring-0' }"
      data-testid="rich-text-source"
      @update:model-value="(v) => onSourceInput(v as string)"
    />

    <!-- WYSIWYG content area -->
    <EditorContent
      v-else-if="editor"
      :editor="editor"
      data-testid="rich-text-content"
    />
    <ClientOnly v-else>
      <template #fallback>
        <div class="px-3 py-2 text-muted text-sm">
          {{ t('admin.cms.richText.loading') }}
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
