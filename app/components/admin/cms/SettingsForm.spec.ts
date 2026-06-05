// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SettingsForm from './SettingsForm.vue'
import type { BlockSettingSchema } from '~/composables/queries/usePageQueries'

/**
 * The control registry: one Nuxt UI control per setting `type`, with a safe
 * JSON/textarea fallback for unknown types. Each control case is its own `it()`
 * block so a teleport-heavy component can't leak DOM between assertions.
 */

function field(partial: Partial<BlockSettingSchema> & { type: string, id: string }): BlockSettingSchema {
  return { label: partial.label ?? partial.id, ...partial } as BlockSettingSchema
}

async function mountWith(fields: BlockSettingSchema[], modelValue: Record<string, unknown> = {}) {
  return mountSuspended(SettingsForm, { props: { fields, modelValue } })
}

describe('SettingsForm control registry', () => {
  it('renders a text input for type=text', async () => {
    const w = await mountWith([field({ type: 'text', id: 'heading', label: 'Heading' })])
    expect(w.find('#setting-heading').exists()).toBe(true)
    expect(w.text()).toContain('Heading')
  })

  it('renders a url input for type=url', async () => {
    const w = await mountWith([field({ type: 'url', id: 'cta_url' })])
    const el = w.find('#setting-cta_url')
    expect(el.exists()).toBe(true)
    expect(el.attributes('type')).toBe('url')
  })

  it('renders an image-url input for type=image_picker', async () => {
    const w = await mountWith([field({ type: 'image_picker', id: 'image_url' })])
    expect(w.find('#setting-image_url').exists()).toBe(true)
  })

  it('renders a textarea for type=textarea', async () => {
    const w = await mountWith([field({ type: 'textarea', id: 'html' })])
    expect(w.find('textarea#setting-html').exists()).toBe(true)
  })

  it('renders the lazy WYSIWYG editor for type=richtext', async () => {
    const w = await mountWith([field({ type: 'richtext', id: 'body' })])
    // The TipTap editor is lazy-loaded; assert the control mounts (toolbar +
    // content/source area) rather than a plain textarea (which only `textarea`
    // now uses). The editor exposes a formatting toolbar by aria-label.
    await new Promise(r => setTimeout(r, 0))
    await w.vm.$nextTick()
    expect(w.find('[role="toolbar"]').exists()).toBe(true)
    // It is NOT a plain monospace textarea control any more.
    expect(w.find('textarea#setting-body').exists()).toBe(false)
  })

  it('renders a number input for type=range', async () => {
    const w = await mountWith([field({ type: 'range', id: 'columns', min: 1, max: 6, step: 1 })])
    expect(w.find('#setting-columns').exists()).toBe(true)
  })

  it('renders a select for type=select', async () => {
    const w = await mountWith([
      field({ type: 'select', id: 'theme', options: [{ value: 'light', label: 'Light' }] }),
    ])
    expect(w.find('#setting-theme').exists()).toBe(true)
  })

  it('renders a switch for type=checkbox', async () => {
    const w = await mountWith([field({ type: 'checkbox', id: 'autoplay' })])
    // USwitch renders a button[role=switch]; assert the label is present.
    expect(w.text()).toContain('autoplay')
    expect(w.find('[role="switch"]').exists()).toBe(true)
  })

  it('renders a colour input for type=color', async () => {
    const w = await mountWith([field({ type: 'color', id: 'bg_color' })])
    const el = w.find('#setting-bg_color')
    expect(el.exists()).toBe(true)
    expect(el.attributes('type')).toBe('color')
  })

  it('renders a datetime-local input for type=datetime', async () => {
    const w = await mountWith([field({ type: 'datetime', id: 'starts_at' })])
    expect(w.find('#setting-starts_at').attributes('type')).toBe('datetime-local')
  })

  it('renders the product picker for type=product', async () => {
    const w = await mountWith([field({ type: 'product', id: 'product_ids', multiple: true })])
    expect(w.find('#setting-product_ids').exists()).toBe(true)
  })

  it('renders the collection picker for type=collection', async () => {
    const w = await mountWith([field({ type: 'collection', id: 'collection_slug' })])
    expect(w.find('#setting-collection_slug').exists()).toBe(true)
  })

  it('falls back to a JSON textarea for an unknown type (never crashes)', async () => {
    const w = await mountWith([field({ type: 'mystery-control', id: 'weird' })])
    expect(w.find('textarea#setting-weird').exists()).toBe(true)
    expect(w.text()).toContain('mystery-control')
  })

  it('shows a "no fields" message for an empty schema', async () => {
    const w = await mountWith([])
    expect(w.text()).toContain('no editable settings')
  })
})

describe('SettingsForm v-model', () => {
  it('emits update:modelValue with the merged settings on text input', async () => {
    const w = await mountWith([field({ type: 'text', id: 'heading' })], { heading: 'Old' })
    await w.find('#setting-heading').setValue('New heading')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)![0]).toMatchObject({ heading: 'New heading' })
  })

  it('seeds the input from the schema default when the value is absent', async () => {
    const w = await mountWith([field({ type: 'text', id: 'heading', default: 'Welcome' })], {})
    expect((w.find('#setting-heading').element as HTMLInputElement).value).toBe('Welcome')
  })
})
