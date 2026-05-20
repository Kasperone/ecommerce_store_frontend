// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductDeleteConfirm from './ProductDeleteConfirm.vue'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

const baseProduct = {
  id: 11,
  name: 'Encyclopedia',
  slug: 'encyclopedia',
  description: null as string | null,
  sku: null as string | null,
  price_usd: 19.99,
  price_pln: 79.99,
  price_eur: 17.99,
  stock: 5,
  is_active: true,
  is_featured: false,
  category_id: null as number | null,
  in_stock: true,
  images: [],
  category: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('ProductDeleteConfirm', () => {
  it('renders the product name in the title', async () => {
    await mountSuspended(ProductDeleteConfirm, {
      props: { open: true, product: baseProduct },
    })
    expect(document.body.textContent).toContain('Encyclopedia')
  })

  it('renders the cancel and delete buttons', async () => {
    await mountSuspended(ProductDeleteConfirm, {
      props: { open: true, product: baseProduct },
    })
    const labels = [...document.querySelectorAll('button')].map(b => b.textContent?.trim())
    expect(labels).toContain('Cancel')
    expect(labels).toContain('Delete')
  })

  it('renders the body copy explaining the deletion is permanent', async () => {
    await mountSuspended(ProductDeleteConfirm, {
      props: { open: true, product: baseProduct },
    })
    expect(document.body.textContent).toContain('permanently removed')
  })

  it('falls back to a generic title when product is null', async () => {
    await mountSuspended(ProductDeleteConfirm, {
      props: { open: true, product: null },
    })
    expect(document.body.textContent).toContain('Delete product')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(ProductDeleteConfirm, {
      props: { open: true, product: baseProduct },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
