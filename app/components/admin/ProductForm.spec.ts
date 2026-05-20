// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ProductForm from './ProductForm.vue'

const baseCategories = [
  {
    id: 1,
    name: 'Books',
    slug: 'books',
    description: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

const baseProduct = {
  id: 7,
  name: 'Encyclopedia',
  slug: 'encyclopedia',
  description: 'A reference work',
  sku: 'ENCY-001',
  price_usd: 19.99,
  price_pln: 79.99,
  price_eur: 17.99,
  stock: 5,
  is_active: true,
  is_featured: false,
  category_id: 1,
  in_stock: true,
  images: [],
  category: baseCategories[0],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('ProductForm', () => {
  it('renders the basics and pricing section headings', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories },
    })
    const html = wrapper.html()
    expect(html).toContain('Basics')
    // The ampersand in "Pricing & stock" gets entity-encoded in the rendered HTML.
    expect(html).toMatch(/Pricing\s*(&amp;|&)\s*stock/)
  })

  it('auto-slugifies the name on blur when the slug is untouched', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories },
    })
    const nameInput = wrapper.find('input[name="name"]').element as HTMLInputElement
    const slugInput = wrapper.find('input[name="slug"]').element as HTMLInputElement
    nameInput.value = 'Encyclopedia of Tea'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(slugInput.value).toBe('encyclopedia-of-tea')
  })

  it('does not overwrite a manually edited slug on subsequent name blur', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories },
    })
    const slugInput = wrapper.find('input[name="slug"]').element as HTMLInputElement
    slugInput.value = 'hand-typed-slug'
    slugInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    const nameInput = wrapper.find('input[name="name"]').element as HTMLInputElement
    nameInput.value = 'Different Name'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    expect(slugInput.value).toBe('hand-typed-slug')
  })

  it('hydrates state from an existing product (name, slug, sku prefilled)', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, product: baseProduct },
    })
    expect((wrapper.find('input[name="name"]').element as HTMLInputElement).value).toBe('Encyclopedia')
    expect((wrapper.find('input[name="slug"]').element as HTMLInputElement).value).toBe('encyclopedia')
    expect((wrapper.find('input[name="sku"]').element as HTMLInputElement).value).toBe('ENCY-001')
  })

  it('keeps the slug stable on subsequent name edits when editing an existing product', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, product: baseProduct },
    })
    const nameInput = wrapper.find('input[name="name"]').element as HTMLInputElement
    nameInput.value = 'Renamed product'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    const slugInput = wrapper.find('input[name="slug"]').element as HTMLInputElement
    // Editing an existing product should not auto-rewrite the slug.
    expect(slugInput.value).toBe('encyclopedia')
  })

  it('renders save and cancel buttons with the supplied submitLabel', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, submitLabel: 'Save & continue' },
    })
    const labels = wrapper.findAll('button').map(b => b.text().trim())
    expect(labels.some(l => l.includes('Save & continue'))).toBe(true)
    expect(labels).toContain('Cancel')
  })

  it('defaults the submit label to "Save" when none is supplied', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories },
    })
    const labels = wrapper.findAll('button').map(b => b.text().trim())
    expect(labels).toContain('Save')
  })

  it('renders three currency input fields (USD, PLN, EUR)', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories },
    })
    const html = wrapper.html()
    expect(html).toContain('USD')
    expect(html).toContain('PLN')
    expect(html).toContain('EUR')
  })
})
