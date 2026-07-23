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

const baseTaxCategories = [
  {
    id: 1,
    code: 'STANDARD',
    name: 'Standard',
    name_pl: null,
    is_default: true,
    rates: [
      {
        id: 1,
        tax_category_id: 1,
        country_code: 'PL',
        rate_pct: '23.00',
        valid_from: '2011-01-01',
        valid_to: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
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
  is_gift_card: false,
  category_id: 1,
  tax_category_id: 1,
  in_stock: true,
  images: [],
  category: baseCategories[0],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('ProductForm', () => {
  it('renders the basics and pricing section headings', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
    })
    const html = wrapper.html()
    expect(html).toContain('Basics')
    // The ampersand in "Pricing & stock" gets entity-encoded in the rendered HTML.
    expect(html).toMatch(/Pricing\s*(&amp;|&)\s*stock/)
  })

  it('auto-slugifies the name on blur when the slug is untouched', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
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
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
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
      props: { categories: baseCategories, taxCategories: baseTaxCategories, product: baseProduct },
    })
    expect((wrapper.find('input[name="name"]').element as HTMLInputElement).value).toBe('Encyclopedia')
    expect((wrapper.find('input[name="slug"]').element as HTMLInputElement).value).toBe('encyclopedia')
    expect((wrapper.find('input[name="sku"]').element as HTMLInputElement).value).toBe('ENCY-001')
  })

  it('keeps the slug stable on subsequent name edits when editing an existing product', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories, product: baseProduct },
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
      props: { categories: baseCategories, taxCategories: baseTaxCategories, submitLabel: 'Save & continue' },
    })
    const labels = wrapper.findAll('button').map(b => b.text().trim())
    expect(labels.some(l => l.includes('Save & continue'))).toBe(true)
    expect(labels).toContain('Cancel')
  })

  it('defaults the submit label to "Save" when none is supplied', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
    })
    const labels = wrapper.findAll('button').map(b => b.text().trim())
    expect(labels).toContain('Save')
  })

  it('renders the EN/PL locale tabs', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
    })
    const html = wrapper.html()
    expect(html).toContain('English')
    expect(html).toContain('Polski')
  })

  it('hydrates the Polish fields from an existing product', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: {
        categories: baseCategories, taxCategories: baseTaxCategories,
        product: { ...baseProduct, name_pl: 'Encyklopedia', description_pl: 'Dzieło' },
      },
    })
    // The PL tab is v-show-hidden by default but still in the DOM.
    expect((wrapper.find('input[name="name_pl"]').element as HTMLInputElement).value).toBe('Encyklopedia')
    expect((wrapper.find('textarea[name="description_pl"]').element as HTMLTextAreaElement).value).toBe('Dzieło')
  })

  it('emits the Polish fields in the submit payload', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: {
        categories: baseCategories, taxCategories: baseTaxCategories,
        product: { ...baseProduct, name_pl: 'Encyklopedia', description_pl: 'Dzieło' },
      },
    })
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    const payload = emitted![0]![0] as Record<string, unknown>
    expect(payload.name_pl).toBe('Encyklopedia')
    expect(payload.description_pl).toBe('Dzieło')
  })

  it('hydrates and emits the merchant + SEO meta fields (SEO blueprint D11)', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: {
        categories: baseCategories, taxCategories: baseTaxCategories,
        product: {
          ...baseProduct,
          brand: 'Acme',
          gtin: '00012345600012',
          mpn: 'ACM-7',
          condition: 'refurbished',
          meta_title: 'Buy the Encyclopedia',
          meta_description: 'The best reference work.',
          meta_title_pl: 'Kup Encyklopedię',
          meta_description_pl: 'Najlepsze dzieło.',
        },
      },
    })
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const payload = wrapper.emitted('submit')![0]![0] as Record<string, unknown>
    expect(payload.brand).toBe('Acme')
    expect(payload.gtin).toBe('00012345600012')
    expect(payload.mpn).toBe('ACM-7')
    expect(payload.condition).toBe('refurbished')
    expect(payload.meta_title).toBe('Buy the Encyclopedia')
    expect(payload.meta_description_pl).toBe('Najlepsze dzieło.')
  })

  it('defaults merchant fields to null + condition "new" in the create payload', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories, product: baseProduct },
    })
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const payload = wrapper.emitted('submit')![0]![0] as Record<string, unknown>
    expect(payload.brand).toBeNull()
    expect(payload.gtin).toBeNull()
    expect(payload.mpn).toBeNull()
    expect(payload.condition).toBe('new')
    expect(payload.meta_title).toBeNull()
  })

  it('hydrates is_gift_card and emits it in the payload', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: {
        categories: baseCategories,
        taxCategories: baseTaxCategories,
        product: { ...baseProduct, is_gift_card: true },
      },
    })
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const payload = wrapper.emitted('submit')![0]![0] as Record<string, unknown>
    expect(payload.is_gift_card).toBe(true)
  })

  it('hides the weight field for a gift-card product', async () => {
    const giftCard = await mountSuspended(ProductForm, {
      props: {
        categories: baseCategories,
        taxCategories: baseTaxCategories,
        product: { ...baseProduct, is_gift_card: true },
      },
    })
    expect(giftCard.find('[name="weight_kg"]').exists()).toBe(false)

    const physical = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories, product: baseProduct },
    })
    expect(physical.find('[name="weight_kg"]').exists()).toBe(true)
  })

  it('renders three currency input fields (USD, PLN, EUR)', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
    })
    const html = wrapper.html()
    expect(html).toContain('USD')
    expect(html).toContain('PLN')
    expect(html).toContain('EUR')
  })

  it('does not surface validation errors before the first submit', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
    })
    const nameInput = wrapper.find('input[name="name"]').element as HTMLInputElement
    nameInput.value = ''
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.html()).not.toContain('Name is required')
    // Distinguish the error message from the pricing hint — both share a prefix.
    expect(wrapper.html()).not.toMatch(/USD, PLN, or EUR/i)
  })

  it('surfaces both name-required and at-least-one-currency errors only on submit', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
    })
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const html = wrapper.html()
    expect(html).toContain('Name is required')
    // The error-only suffix — the hint shares the prefix.
    expect(html).toMatch(/USD, PLN, or EUR/i)
  })

  it('renders length / width / height inputs in the inventory section', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: { categories: baseCategories, taxCategories: baseTaxCategories },
    })
    const html = wrapper.html()
    expect(html).toContain('Length (cm)')
    expect(html).toContain('Width (cm)')
    expect(html).toContain('Height (cm)')
  })

  it('hydrates dimensions from an existing product', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: {
        categories: baseCategories, taxCategories: baseTaxCategories,
        product: { ...baseProduct, length_cm: 60, width_cm: 60, height_cm: 30 },
      },
    })
    // UInputNumber renders a text-type input; just confirm the values surface.
    const html = wrapper.html()
    expect(html).toMatch(/value="60"/)
    expect(html).toMatch(/value="30"/)
  })

  it('emits null for unset dimensions on submit (legacy product path)', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: {
        categories: baseCategories, taxCategories: baseTaxCategories,
        product: { ...baseProduct }, // no dims set
      },
    })
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    const payload = emitted![0]![0] as Record<string, unknown>
    expect(payload.length_cm).toBeNull()
    expect(payload.width_cm).toBeNull()
    expect(payload.height_cm).toBeNull()
  })

  it('emits set dimensions on submit', async () => {
    const wrapper = await mountSuspended(ProductForm, {
      props: {
        categories: baseCategories, taxCategories: baseTaxCategories,
        product: { ...baseProduct, length_cm: 60, width_cm: 60, height_cm: 30 },
      },
    })
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    const payload = emitted![0]![0] as Record<string, unknown>
    expect(payload.length_cm).toBe(60)
    expect(payload.width_cm).toBe(60)
    expect(payload.height_cm).toBe(30)
  })
})
