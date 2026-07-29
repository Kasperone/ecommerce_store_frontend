<script setup lang="ts">
/**
 * CMS page editor (Shopify theme-editor model).
 *
 * Three panes:
 *  - LEFT: a reorderable section list (`AdminCmsSectionList`, vuedraggable) +
 *    an "Add section" preset picker (`AdminCmsAddSectionModal`).
 *  - MIDDLE: a schema-driven settings form (`AdminCmsSettingsForm`) for the
 *    selected section, generated from `GET /blocks/schema`.
 *  - RIGHT: an inline live preview (`PageRenderer`) of the working draft — the
 *    exact production renderer, so WYSIWYG parity is guaranteed.
 *
 * Draft state lives in `usePageEditorState` (stable client ids + dirty tracking).
 * Buttons: Save draft (`PATCH …/draft`), Publish (`POST …/publish`), and a
 * version-history drawer with rollback.
 */
import { onBeforeRouteLeave } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ValidatedFormInstance } from '~/composables/useValidatedForm'
import type { Section } from '~/blocks/types'
import { DEVICE_WIDTHS } from '~/utils/devicePreview'
import type { DeviceMode } from '~/utils/devicePreview'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const localePath = useLocalePath()

const pageId = computed(() => Number(route.params.id))

const { data: page, error: pageError } = usePageQuery(pageId)
const { data: schemaData } = useBlockSchemasQuery()
const {
  data: versionData,
  refetch: refetchVersions,
} = usePageVersionsQuery(pageId)

useHead({ title: () => (page.value ? t('admin.cms.editor.title', { slug: page.value.slug }) : t('admin.cms.title')) })

// ---- Block schema registry ------------------------------------------------ //
const blockSchemas = computed(() => schemaData.value?.blocks ?? [])
const typeNames = computed<Record<string, string>>(() =>
  Object.fromEntries(blockSchemas.value.map(b => [b.type, b.name])),
)

// ---- Editor state --------------------------------------------------------- //
const editor = usePageEditorState()
const {
  sections,
  selectedCid,
  selectedSection,
  isDirty,
} = editor

// Load the draft layout into the editor whenever the page (re)loads.
watch(
  page,
  (p) => {
    if (p) editor.load(p.draft_layout?.sections)
  },
  { immediate: true },
)

const selectedSchema = computed(() =>
  blockSchemas.value.find(b => b.type === selectedSection.value?.type),
)
const selectedFields = computed(() => selectedSchema.value?.settings ?? [])
const selectedSettings = computed(() => selectedSection.value?.settings ?? {})

function onSettingsUpdate(settings: Record<string, unknown>) {
  editor.updateSelectedSettings(settings)
}

// ---- Nested sub-blocks (container sections) ------------------------------- //
// Container sections (slideshow/faq/image-gallery/collection-list) carry a child
// schema map on `selectedSchema.blocks`. Child selection is LOCAL to the editor
// page (it doesn't belong in the page-level draft state); it resets whenever the
// selected section changes.
const selectedChildSchemas = computed(() => selectedSchema.value?.blocks)
const selectedChildId = ref<string | null>(null)
watch(selectedCid, () => (selectedChildId.value = null))

function onAddChild(childType: string) {
  const newId = editor.addChildBlock(childType, {})
  if (newId) selectedChildId.value = newId
}
function onRemoveChild(id: string) {
  editor.removeChildBlock(id)
  if (selectedChildId.value === id) selectedChildId.value = null
}

// Sections for the live preview — structurally the renderer's `Section[]`.
const previewSections = computed<Section[]>(() =>
  sections.value.map(s => ({
    id: s.__cid,
    type: s.type,
    settings: s.settings,
    blocks: s.blocks,
  })) as unknown as Section[],
)

// ---- Edit mode (Form ⇄ Visual) -------------------------------------------- //
type EditMode = 'form' | 'visual'
const editMode = ref<EditMode>('form')
const modeItems = computed(() => [
  { label: t('admin.cms.visual.modeForm'), value: 'form' as const, icon: 'i-lucide-sliders-horizontal' },
  { label: t('admin.cms.visual.modeVisual'), value: 'visual' as const, icon: 'i-lucide-layout-panel-top' },
])

// ---- Device preview ------------------------------------------------------- //
// A responsive-preview frame: Desktop (full width) / Tablet (768px) / Mobile
// (375px). The selected width is applied to a centered inner frame in BOTH the
// Form-mode preview pane and the Visual canvas pane, so full-bleed blocks render
// at a realistic device width instead of overflowing the pane. Local UI state;
// defaults to Desktop (current behavior).
const device = ref<DeviceMode>('desktop')
// `max-width` only — `null` (desktop) leaves the frame full-width. The frame is
// `mx-auto` so tablet/mobile center within the scroll container.
const deviceFrameStyle = computed(() => {
  const w = DEVICE_WIDTHS[device.value]
  return w === null ? {} : { maxWidth: `${w}px` }
})

// ---- Add section ---------------------------------------------------------- //
const addOpen = ref(false)
// When set, an Add-section pick inserts at this index (visual drop-zone); when
// null, it appends (the left-rail "Add" button / form mode).
const addAtIndex = ref<number | null>(null)
function onAddSection(section: { type: string, settings: Record<string, unknown> }) {
  if (addAtIndex.value !== null) {
    editor.addSectionAt(section.type, section.settings, addAtIndex.value)
    addAtIndex.value = null
  }
  else {
    editor.addSection(section.type, section.settings)
  }
}
function openAddAt(index: number) {
  addAtIndex.value = index
  addOpen.value = true
}
function openAddAppend() {
  addAtIndex.value = null
  addOpen.value = true
}

// ---- Save draft / publish ------------------------------------------------- //
const saveDraft = useSavePageDraft()
const publish = usePublishPage()
const previewToken = useCreatePreviewToken()

// The editor has no client-validatable fields (draft autosave + publish/rollback
// actions), so it converges only the error message + toast: a null form ref
// makes applyApiError skip field-mapping/scroll.
const noForm = ref<ValidatedFormInstance | null>(null)
const { errorMessage: error, applyApiError } = useValidatedForm(noForm, {
  toast,
  t,
  toastTitleKey: 'messages.saveErrorTitle',
})

/** Persist the working draft if dirty (shared by Save / Publish / Preview). */
async function flushDraft() {
  if (!isDirty.value) return
  await saveDraft.mutateAsync({
    id: pageId.value,
    patch: { draft_layout: { sections: toLayoutSections(sections.value) } },
  })
  editor.markSaved()
}

async function onSaveDraft() {
  error.value = ''
  try {
    await saveDraft.mutateAsync({
      id: pageId.value,
      patch: { draft_layout: { sections: toLayoutSections(sections.value) } },
    })
    editor.markSaved()
    toast.add({ title: t('admin.cms.flashes.draftSaved'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    applyApiError(err, t('admin.cms.flashes.saveFailed'))
  }
}

// ---- Preview draft / view live -------------------------------------------- //
// "Preview draft": save the working draft (so the preview reflects what's on
// screen), mint a signed token, then open the public draft-preview route in a
// new tab — locale-prefixed so /pl/ works. We open the tab *synchronously* on
// click (a placeholder `about:blank`) and only redirect it once the async token
// is minted; opening inside the async callback would be swallowed by popup
// blockers, which only trust window.open in the click's call stack.
async function onPreviewDraft() {
  error.value = ''
  const tab = window.open('', '_blank')
  try {
    await flushDraft()
    const { token } = await previewToken.mutateAsync({ id: pageId.value })
    const slug = page.value?.slug ?? ''
    const url = `${localePath(`/${slug}`)}?token=${encodeURIComponent(token)}`
    if (tab) tab.location.href = url
    else window.open(url, '_blank')
  }
  catch (err) {
    tab?.close()
    applyApiError(err, t('admin.cms.flashes.previewFailed'))
  }
}

const liveUrl = computed(() => localePath(`/${page.value?.slug ?? ''}`))

const publishOpen = ref(false)
const publishLabel = ref('')

function openPublish() {
  publishLabel.value = ''
  error.value = ''
  publishOpen.value = true
}

async function onPublish() {
  error.value = ''
  try {
    // Persist the working draft first so Publish snapshots exactly what's on screen.
    await flushDraft()
    await publish.mutateAsync({
      id: pageId.value,
      body: publishLabel.value.trim() ? { label: publishLabel.value.trim() } : {},
    })
    publishOpen.value = false
    await refetchVersions()
    toast.add({ title: t('admin.cms.flashes.published'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}

// ---- Version history + rollback ------------------------------------------- //
const versions = computed(() => versionData.value?.items ?? [])
const historyOpen = ref(false)
const rollback = useRollbackPageVersion()

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

async function onRollback(versionId: number) {
  error.value = ''
  try {
    const restored = await rollback.mutateAsync({ id: pageId.value, versionId })
    editor.load(restored.draft_layout?.sections)
    await refetchVersions()
    historyOpen.value = false
    toast.add({ title: t('admin.cms.flashes.rolledBack'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    applyApiError(err, t('messages.saveError'))
  }
}

const isBusy = computed(() => saveDraft.isLoading.value || publish.isLoading.value)

// ---- Unsaved-changes navigation guard ------------------------------------- //
// In-router navigation (back arrow, sidebar links, etc.) is intercepted while
// the working draft is dirty; we surface an in-app confirm modal and resolve
// the route guard from the admin's choice. A successful save/publish clears
// `isDirty`, so those flows are never blocked.
const leaveGuardOpen = ref(false)
let leaveResolver: ((leave: boolean) => void) | null = null

function resolveLeave(leave: boolean) {
  leaveGuardOpen.value = false
  leaveResolver?.(leave)
  leaveResolver = null
}

onBeforeRouteLeave(() => {
  if (!isDirty.value) return true
  leaveGuardOpen.value = true
  return new Promise<boolean>((resolve) => {
    leaveResolver = resolve
  })
})

// Hard close / refresh / external navigation: trigger the browser's native
// "leave site?" prompt while the draft is dirty.
useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  if (isDirty.value) e.preventDefault()
})
</script>

<template>
  <NuxtLayout>
    <div class="space-y-4">
      <!-- Header / toolbar -->
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            :to="localePath('/admin/pages')"
            :aria-label="t('admin.cms.editor.back')"
          />
          <div>
            <h1 class="text-xl font-bold flex items-center gap-2">
              <span v-if="page">/{{ page.slug }}</span>
              <span v-else>{{ t('admin.cms.title') }}</span>
              <UBadge
                v-if="page"
                :color="page.status === 'published' ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ t(`admin.cms.status.${page.status}`) }}
              </UBadge>
              <UBadge
                v-if="isDirty"
                color="warning"
                variant="subtle"
              >
                {{ t('admin.cms.editor.unsaved') }}
              </UBadge>
            </h1>
            <p
              v-if="page"
              class="text-muted text-sm"
            >
              {{ t(`admin.cms.pageType.${page.type}`) }} · {{ page.locale.toUpperCase() }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!--
            Client-only on purpose: server-rendered, this `UTabs` never hydrates
            its interactivity (correct markup, correct ARIA, no console error —
            the trigger simply never emits), which left the Form/Visual switch
            dead on a hard load. Unlike the panes below it, this toolbar renders
            unconditionally rather than behind `v-if="page"`, so it *was* in the
            SSR payload and hit the bug.
          -->
          <ClientOnly>
            <UTabs
              v-model="editMode"
              :items="modeItems"
              :content="false"
              size="sm"
              color="primary"
              :aria-label="t('admin.cms.visual.modeLabel')"
              data-testid="edit-mode-toggle"
            />
          </ClientOnly>
          <UButton
            v-if="page && page.status === 'published'"
            color="neutral"
            variant="ghost"
            icon="i-lucide-external-link"
            :to="liveUrl"
            target="_blank"
            data-testid="view-live"
          >
            {{ t('admin.cms.actions.viewLive') }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-eye"
            :loading="previewToken.isLoading.value"
            :disabled="isBusy"
            data-testid="preview-draft"
            @click="onPreviewDraft"
          >
            {{ t('admin.cms.actions.previewDraft') }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-history"
            @click="historyOpen = true"
          >
            {{ t('admin.cms.actions.history') }}
          </UButton>
          <UButton
            color="neutral"
            icon="i-lucide-save"
            :loading="saveDraft.isLoading.value"
            :disabled="!isDirty || isBusy"
            @click="onSaveDraft"
          >
            {{ t('admin.cms.actions.saveDraft') }}
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-rocket"
            :disabled="isBusy"
            @click="openPublish"
          >
            {{ t('admin.cms.actions.publish') }}
          </UButton>
        </div>
      </header>

      <ErrorAlert
        v-if="pageError"
        :problem="parseProblem(pageError)"
      />
      <UAlert
        v-else-if="error"
        role="alert"
        color="error"
        variant="soft"
        :title="t('messages.saveErrorTitle')"
        :description="error"
        :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
        @close="error = ''"
      />

      <!-- Three-pane editor (Form mode) -->
      <div
        v-if="page && editMode === 'form'"
        class="grid grid-cols-1 lg:grid-cols-12 gap-4"
      >
        <!-- LEFT: section list -->
        <section class="lg:col-span-3 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-sm uppercase text-muted tracking-wide">
              {{ t('admin.cms.sections.heading') }}
            </h2>
            <UButton
              color="primary"
              variant="soft"
              size="xs"
              icon="i-lucide-plus"
              @click="openAddAppend"
            >
              {{ t('admin.cms.sections.add') }}
            </UButton>
          </div>
          <AdminCmsSectionList
            v-model="sections"
            :selected-id="selectedCid"
            :type-names="typeNames"
            @select="(id) => (selectedCid = id)"
            @remove="(id) => editor.removeSection(id)"
            @move="({ id, direction }) => editor.moveSection(id, direction)"
          />
        </section>

        <!-- MIDDLE: settings form -->
        <section class="lg:col-span-4 space-y-3">
          <h2 class="font-semibold text-sm uppercase text-muted tracking-wide">
            {{ t('admin.cms.settings.heading') }}
          </h2>
          <div
            v-if="selectedSection"
            class="rounded-lg border border-default p-4"
          >
            <p class="font-medium mb-3">
              {{ typeNames[selectedSection.type] ?? selectedSection.type }}
            </p>
            <AdminCmsSettingsForm
              :fields="selectedFields"
              :model-value="selectedSettings"
              @update:model-value="onSettingsUpdate"
            />
            <AdminCmsSubBlockList
              v-if="selectedChildSchemas"
              class="mt-4 pt-4 border-t border-default"
              :model-value="(selectedSection.blocks as any) ?? []"
              :child-schemas="selectedChildSchemas"
              :selected-child-id="selectedChildId"
              @add="onAddChild"
              @select="(id) => (selectedChildId = id)"
              @remove="onRemoveChild"
              @move="({ id, direction }) => editor.moveChildBlock(id, direction)"
              @reorder="(ids) => editor.reorderChildBlocks(ids)"
            />
          </div>
          <p
            v-else
            class="text-muted text-sm py-6 text-center rounded-lg border border-dashed border-default"
          >
            {{ t('admin.cms.settings.selectPrompt') }}
          </p>
        </section>

        <!-- RIGHT: live preview -->
        <section class="lg:col-span-5 space-y-3">
          <h2 class="font-semibold text-sm uppercase text-muted tracking-wide">
            {{ t('admin.cms.preview.heading') }}
          </h2>
          <div class="rounded-lg border border-default overflow-hidden bg-default">
            <div class="bg-elevated px-3 py-1.5 text-xs text-muted border-b border-default flex items-center justify-between gap-2">
              <span>{{ t('admin.cms.preview.label') }}</span>
              <AdminCmsDevicePreview v-model="device" />
            </div>
            <div class="max-h-[70vh] overflow-auto">
              <div
                class="mx-auto"
                :style="deviceFrameStyle"
                data-testid="preview-device-frame"
              >
                <ClientOnly>
                  <PageRenderer :sections="previewSections" />
                  <p
                    v-if="previewSections.length === 0"
                    class="text-muted text-sm py-12 text-center"
                  >
                    {{ t('admin.cms.preview.empty') }}
                  </p>
                </ClientOnly>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Visual (WYSIWYG canvas) mode -->
      <div
        v-else-if="page && editMode === 'visual'"
        class="grid grid-cols-1 lg:grid-cols-12 gap-4"
      >
        <!-- LEFT/CENTER: live canvas -->
        <section class="lg:col-span-8 space-y-3">
          <h2 class="font-semibold text-sm uppercase text-muted tracking-wide">
            {{ t('admin.cms.visual.canvasHeading') }}
          </h2>
          <div class="rounded-lg border border-default overflow-hidden bg-default">
            <div class="bg-elevated px-3 py-1.5 text-xs text-muted border-b border-default flex items-center justify-between gap-2">
              <span>{{ t('admin.cms.visual.canvasLabel') }}</span>
              <AdminCmsDevicePreview v-model="device" />
            </div>
            <!--
              `overflow-auto` clips the selected block's `ring-offset-2` ring at the
              edges, so the scroll container carries horizontal+top padding to give
              the ring room. The inner frame is `mx-auto` so tablet/mobile widths
              center within the pane.
            -->
            <div class="max-h-[75vh] overflow-auto px-3 py-3">
              <div
                class="mx-auto"
                :style="deviceFrameStyle"
                data-testid="canvas-device-frame"
              >
                <ClientOnly>
                  <AdminCmsVisualCanvas
                    :sections="sections"
                    :selected-cid="selectedCid"
                    :type-names="typeNames"
                    @select="(cid) => (selectedCid = cid)"
                    @remove="(cid) => editor.removeSection(cid)"
                    @move="({ cid, direction }) => editor.moveSection(cid, direction)"
                    @reorder="(orderedCids) => editor.reorder(orderedCids)"
                    @add-at="openAddAt"
                  />
                  <template #fallback>
                    <p class="text-muted text-sm py-12 text-center">
                      {{ t('admin.cms.visual.empty') }}
                    </p>
                  </template>
                </ClientOnly>
              </div>
            </div>
          </div>
        </section>

        <!-- RIGHT: settings form for the selected block -->
        <section class="lg:col-span-4 space-y-3">
          <h2 class="font-semibold text-sm uppercase text-muted tracking-wide">
            {{ t('admin.cms.settings.heading') }}
          </h2>
          <div
            v-if="selectedSection"
            class="rounded-lg border border-default p-4"
          >
            <p class="font-medium mb-3">
              {{ typeNames[selectedSection.type] ?? selectedSection.type }}
            </p>
            <AdminCmsSettingsForm
              :fields="selectedFields"
              :model-value="selectedSettings"
              @update:model-value="onSettingsUpdate"
            />
            <AdminCmsSubBlockList
              v-if="selectedChildSchemas"
              class="mt-4 pt-4 border-t border-default"
              :model-value="(selectedSection.blocks as any) ?? []"
              :child-schemas="selectedChildSchemas"
              :selected-child-id="selectedChildId"
              @add="onAddChild"
              @select="(id) => (selectedChildId = id)"
              @remove="onRemoveChild"
              @move="({ id, direction }) => editor.moveChildBlock(id, direction)"
              @reorder="(ids) => editor.reorderChildBlocks(ids)"
            />
          </div>
          <p
            v-else
            class="text-muted text-sm py-6 text-center rounded-lg border border-dashed border-default"
          >
            {{ t('admin.cms.visual.selectPrompt') }}
          </p>
        </section>
      </div>

      <!-- Add section preset picker -->
      <AdminCmsAddSectionModal
        :open="addOpen"
        :schemas="blockSchemas"
        @update:open="(v) => (addOpen = v)"
        @pick="onAddSection"
      />

      <!-- Publish modal -->
      <AdminFormModal
        :open="publishOpen"
        :title="t('admin.cms.publish.title')"
        :description="t('admin.cms.publish.subtitle')"
        :submit-label="t('admin.cms.actions.publish')"
        :cancel-label="t('admin.cms.form.cancel')"
        :loading="publish.isLoading.value || saveDraft.isLoading.value"
        @update:open="(v) => (publishOpen = v)"
        @submit="onPublish"
      >
        <template #body>
          <UFormField
            :label="t('admin.cms.publish.label')"
            :help="t('admin.cms.publish.labelHint')"
            name="label"
          >
            <UInput
              v-model="publishLabel"
              class="w-full"
            />
          </UFormField>
        </template>
      </AdminFormModal>

      <!-- Unsaved-changes confirm (in-router navigation guard) -->
      <AdminFormModal
        :open="leaveGuardOpen"
        :title="t('admin.cms.editor.leaveGuard.title')"
        :description="t('admin.cms.editor.leaveGuard.body')"
        :submit-label="t('admin.cms.editor.leaveGuard.confirm')"
        :cancel-label="t('admin.cms.editor.leaveGuard.cancel')"
        @update:open="(v) => { if (!v) resolveLeave(false) }"
        @submit="resolveLeave(true)"
        @cancel="resolveLeave(false)"
      />

      <!-- Version history drawer -->
      <UModal
        v-model:open="historyOpen"
        :title="t('admin.cms.history.title')"
        :description="t('admin.cms.history.subtitle')"
      >
        <template #body>
          <div
            v-if="versions.length === 0"
            class="text-muted text-sm py-6 text-center"
          >
            {{ t('admin.cms.history.empty') }}
          </div>
          <ul
            v-else
            class="divide-y divide-default"
          >
            <li
              v-for="version in versions"
              :key="version.id"
              class="flex items-center justify-between gap-3 py-2.5"
            >
              <div class="min-w-0">
                <p class="font-medium text-sm">
                  {{ t('admin.cms.history.version', { no: version.version_no }) }}
                  <span
                    v-if="version.label"
                    class="text-muted font-normal"
                  >· {{ version.label }}</span>
                </p>
                <p class="text-muted text-xs">
                  {{ formatDateTime(version.created_at) }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                icon="i-lucide-rotate-ccw"
                :loading="rollback.isLoading.value"
                @click="onRollback(version.id)"
              >
                {{ t('admin.cms.history.rollback') }}
              </UButton>
            </li>
          </ul>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>
