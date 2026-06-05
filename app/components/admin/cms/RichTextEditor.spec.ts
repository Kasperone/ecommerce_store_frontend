// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RichTextEditor from './RichTextEditor.vue'

/**
 * The CMS `richtext` control — a TipTap WYSIWYG that emits allowlist-safe HTML.
 *
 * TipTap drives a real ProseMirror instance over the (happy-dom-backed) Nuxt
 * test env. We assert the v-model HTML contract, the source toggle, and that
 * the configured extension set is a strict SUBSET of the backend nh3 allowlist
 * (so save → reload round-trips are stable — nothing the editor emits is
 * stripped on save).
 */

/** Mirror of `_HTML_ALLOWED_TAGS` in backend `admin_pages.py`. */
const NH3_ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li',
  'ol', 'p', 'pre', 'section', 'small', 'span', 'strong', 'sub',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
  'u', 'ul',
])
/** Allowed attributes on <a> per `_HTML_ALLOWED_ATTRS["a"]`. */
const NH3_A_ATTRS = new Set(['href', 'title', 'target'])

async function mountEditor(modelValue = '') {
  const w = await mountSuspended(RichTextEditor, {
    props: { fieldId: 'body', modelValue },
  })
  // Let the client-only editor instantiate.
  await new Promise(r => setTimeout(r, 0))
  await w.vm.$nextTick()
  return w
}

/** Pull the live TipTap editor instance off the component. */
function tiptap(w: Awaited<ReturnType<typeof mountEditor>>) {
  // `editor` is a top-level ref in <script setup>; mountSuspended exposes it.
  const ed = (w.vm as unknown as { editor: { value: any } | any }).editor
  return ed?.value ?? ed
}

/** Extract every tag name from an HTML string. */
function tagsIn(html: string): string[] {
  return [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)/g)].map(m => m[1]!.toLowerCase())
}

describe('AdminCmsRichTextEditor', () => {
  it('renders a formatting toolbar with the expected controls', async () => {
    const w = await mountEditor()
    expect(w.find('[role="toolbar"]').exists()).toBe(true)
    // Toolbar exposes bold/italic/underline/link/lists/headings by aria-label.
    const labels = w.findAll('[role="toolbar"] button').map(b => b.attributes('aria-label'))
    expect(labels).toContain('Bold')
    expect(labels).toContain('Italic')
    expect(labels).toContain('Underline')
    expect(labels).toContain('Link')
    expect(labels).toContain('Bullet list')
    expect(labels).toContain('Numbered list')
    expect(labels).toContain('Heading 1')
    expect(labels).toContain('Heading 6')
  })

  it('seeds its content from the model value', async () => {
    const w = await mountEditor('<p>hello world</p>')
    const ed = tiptap(w)
    expect(ed).toBeTruthy()
    expect(ed.getHTML()).toContain('hello world')
  })

  it('typing then bold emits <strong> via v-model', async () => {
    const w = await mountEditor('')
    const ed = tiptap(w)
    ed.commands.setContent('<p>hello</p>')
    ed.commands.selectAll()
    ed.chain().focus().toggleBold().run()
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted!.at(-1)![0] as string
    expect(last).toContain('<strong>')
    expect(last).toContain('hello')
  })

  it('link insertion produces an <a href> (allowlist-safe attrs only)', async () => {
    const w = await mountEditor('<p>click me</p>')
    const ed = tiptap(w)
    ed.commands.selectAll()
    ed.chain().focus().extendMarkRange('link').setLink({ href: 'https://example.com' }).run()
    const html = ed.getHTML()
    expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com"/)
    // Every attribute on the produced <a> must be in the nh3 allowlist (rel is
    // managed by nh3 itself, so the editor's rel will be normalized at save).
    const aTag = html.match(/<a ([^>]*)>/)?.[1] ?? ''
    const attrNames = [...aTag.matchAll(/([a-zA-Z-]+)=/g)].map(m => m[1]!.toLowerCase())
    for (const attr of attrNames) {
      if (attr === 'rel' || attr === 'class') continue // nh3 manages rel; class is globally allowed
      expect(NH3_A_ATTRS.has(attr)).toBe(true)
    }
  })

  it('pasting/loading disallowed markup is normalized to the allowed subset', async () => {
    // <script>, <iframe>, <marquee> and <s> (strike) are NOT in the allowlist;
    // TipTap should drop them (strike disabled; unknown nodes ignored).
    const w = await mountEditor(
      '<p>safe</p><scr' + 'ipt>alert(1)</scr' + 'ipt><s>struck</s><marquee>m</marquee>',
    )
    const ed = tiptap(w)
    const html = ed.getHTML()
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<marquee')
    expect(html).not.toContain('<s>')
    expect(html).toContain('safe')
  })

  it('every tag the editor can emit is within the nh3 allowlist (stable round-trip)', async () => {
    // A representative doc exercising every enabled node/mark.
    const w = await mountEditor('')
    const ed = tiptap(w)
    ed.chain()
      .setContent('<p>p</p>')
      .run()
    ed.commands.insertContent(
      '<h1>h1</h1><h2>h2</h2><h6>h6</h6>'
      + '<p><strong>b</strong><em>i</em><u>u</u><code>c</code>'
      + '<a href="https://x.test" title="t" target="_blank">l</a></p>'
      + '<ul><li>x</li></ul><ol><li>y</li></ol>'
      + '<blockquote>q</blockquote><pre><code>cb</code></pre><hr>',
    )
    const html = ed.getHTML()
    const tags = new Set(tagsIn(html))
    const stray = [...tags].filter(t => !NH3_ALLOWED_TAGS.has(t))
    expect(stray).toEqual([])
  })

  it('toggles the raw-HTML source textarea', async () => {
    const w = await mountEditor('<p>x</p>')
    // Initially the WYSIWYG content area is shown, not the source textarea.
    expect(w.find('[data-testid="rich-text-source"]').exists()).toBe(false)
    expect(w.find('[data-testid="rich-text-content"]').exists()).toBe(true)

    await w.find('[aria-label="Toggle HTML source"]').trigger('click')
    expect(w.find('[data-testid="rich-text-source"]').exists()).toBe(true)
    // The source textarea reflects the model value.
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toContain('x')
  })

  it('editing the source textarea emits update:modelValue', async () => {
    const w = await mountEditor('<p>x</p>')
    await w.find('[aria-label="Toggle HTML source"]').trigger('click')
    await w.find('textarea').setValue('<p>edited via source</p>')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)![0]).toBe('<p>edited via source</p>')
  })
})
