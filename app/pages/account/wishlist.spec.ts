// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { WishlistItem } from '~/composables/queries/useWishlistQueries'

/**
 * Wishlist account page. It owns: the list (client-gated Colada query), a remove
 * button per tile (delete mutation), an empty state with a browse CTA, and the
 * greyed-out treatment for inactive / out-of-stock rows (still returned by the
 * API). The Colada composables, the currency preference, and `useToast` are
 * mocked at their auto-import boundaries.
 */

const ITEM = (over: Partial<WishlistItem> = {}): WishlistItem => ({
  id: 1,
  created_at: '2026-06-08T10:00:00Z',
  updated_at: '2026-06-08T10:00:00Z',
  product_id: 42,
  variant_id: null,
  product_slug: 'blue-mug',
  product_name: 'Blue Mug',
  product_name_pl: null,
  product_image_url: null,
  price_usd: 12,
  price_pln: 48,
  price_eur: 11,
  is_active: true,
  in_stock: true,
  variant_sku: null,
  variant_title: null,
  ...over,
})

const ITEMS: WishlistItem[] = [
  ITEM({ id: 1, product_id: 42, product_name: 'Blue Mug', variant_title: 'Large' }),
  ITEM({ id: 2, product_id: 99, product_name: 'Out Of Stock Lamp', in_stock: false }),
  ITEM({ id: 3, product_id: 7, product_name: 'Discontinued Hat', is_active: false }),
]

const wishlistData = ref<WishlistItem[]>(ITEMS)
const wishlistLoading = ref(false)
const removeMutate = vi.fn()

vi.mock('~/composables/queries/useWishlistQueries', () => ({
  useWishlistQuery: () => ({ data: wishlistData, isLoading: wishlistLoading }),
  useRemoveFromWishlist: () => ({ mutateAsync: removeMutate }),
}))

mockNuxtImport('useCurrencyPreference', () => () => ({ currency: ref('USD') }))

const toastAdd = vi.fn()
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const tick = () => new Promise(r => setTimeout(r, 0))

async function mountPage() {
  const WishlistPage = (await import('./wishlist.vue')).default
  return mountSuspended(WishlistPage, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

function allButtons(wrapper: Awaited<ReturnType<typeof mountPage>>): HTMLButtonElement[] {
  const inPage = [...wrapper.element.querySelectorAll('button')] as HTMLButtonElement[]
  const inBody = [...document.body.querySelectorAll('button')] as HTMLButtonElement[]
  return [...new Set([...inPage, ...inBody])]
}

function combinedText(wrapper: Awaited<ReturnType<typeof mountPage>>): string {
  return `${wrapper.element.textContent ?? ''}${document.body.textContent ?? ''}`
}

beforeEach(() => {
  wishlistData.value = ITEMS
  wishlistLoading.value = false
  removeMutate.mockReset().mockResolvedValue(undefined)
  toastAdd.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('account/wishlist — list', () => {
  it('renders a tile per saved item', async () => {
    const wrapper = await mountPage()
    const text = combinedText(wrapper)
    expect(text).toContain('Blue Mug')
    expect(text).toContain('Out Of Stock Lamp')
    expect(text).toContain('Discontinued Hat')
  })

  it('shows the variant label when present', async () => {
    const wrapper = await mountPage()
    expect(combinedText(wrapper)).toContain('Large')
  })

  it('renders the formatted price in the chosen currency', async () => {
    const wrapper = await mountPage()
    // USD currency → the price_usd column ($12).
    expect(combinedText(wrapper)).toContain('$12')
  })

  it('badges out-of-stock and unavailable items', async () => {
    const wrapper = await mountPage()
    const text = combinedText(wrapper)
    expect(text).toContain('Out of stock')
    expect(text).toContain('Unavailable')
  })

  it('greys out inactive / out-of-stock tiles', async () => {
    const wrapper = await mountPage()
    const dimmed = [...wrapper.element.querySelectorAll('article.opacity-60')]
    // The lamp (out of stock) and the hat (inactive) are dimmed; the mug is not.
    expect(dimmed).toHaveLength(2)
  })
})

describe('account/wishlist — empty state', () => {
  it('shows the empty state + browse CTA when there are no items', async () => {
    wishlistData.value = []
    const wrapper = await mountPage()
    expect(combinedText(wrapper)).toContain('Your wishlist is empty.')
    expect(combinedText(wrapper)).toContain('Browse products')
  })
})

describe('account/wishlist — remove', () => {
  it('calls the remove mutation with the item id and toasts success', async () => {
    const wrapper = await mountPage()
    const removeBtn = allButtons(wrapper).find(
      b => b.getAttribute('aria-label') === 'Remove from wishlist',
    )
    removeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(removeMutate).toHaveBeenCalledWith(1)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })
})
