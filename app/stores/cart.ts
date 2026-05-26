import { defineStore, skipHydrate } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ProductResponse, ProductWithCategory } from '#shared/types/api'

/**
 * Client-side shopping cart (Phase 2).
 *
 * Lines snapshot the product fields the cart needs to render — name, image,
 * all three currency prices, and stock — so the drawer/page show correctly in
 * any selected currency (see `useCurrencyPreference` + `shared/utils/money.ts`)
 * without re-fetching, and quantities can be clamped to available stock.
 *
 * State is persisted to `localStorage` on the client only; the cart is
 * client-only state, so its UI (header badge, drawer, /cart page) must render
 * client-side to avoid SSR hydration mismatches. Order creation happens at
 * checkout (Phase 3) against `POST /orders/`.
 */

export interface CartItem {
  productId: number
  slug: string
  name: string
  imageUrl: string | null
  price_usd: number | null
  price_pln: number | null
  price_eur: number | null
  stock: number
  quantity: number
}

type AddableProduct = Pick<
  ProductResponse | ProductWithCategory,
  'id' | 'slug' | 'name' | 'images' | 'price_usd' | 'price_pln' | 'price_eur' | 'stock'
>

const STORAGE_KEY = 'cart'

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])
  const isOpen = ref(false)

  const count = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))
  const isEmpty = computed(() => items.value.length === 0)

  function primaryImageUrl(product: AddableProduct): string | null {
    const images = product.images ?? []
    return (images.find(image => image.is_primary) ?? images[0])?.url ?? null
  }

  function remove(productId: number) {
    items.value = items.value.filter(item => item.productId !== productId)
  }

  function add(product: AddableProduct, quantity = 1) {
    if (product.stock <= 0) return
    const existing = items.value.find(item => item.productId === product.id)
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, product.stock)
      return
    }
    items.value.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      imageUrl: primaryImageUrl(product),
      price_usd: product.price_usd,
      price_pln: product.price_pln,
      price_eur: product.price_eur,
      stock: product.stock,
      quantity: Math.min(Math.max(quantity, 1), product.stock),
    })
  }

  function setQuantity(productId: number, quantity: number) {
    const item = items.value.find(item => item.productId === productId)
    if (!item) return
    if (quantity <= 0) {
      remove(productId)
      return
    }
    item.quantity = Math.min(quantity, item.stock)
  }

  function clear() {
    items.value = []
  }

  function openDrawer() {
    isOpen.value = true
  }

  function closeDrawer() {
    isOpen.value = false
  }

  // Persist on the client only — SSR has no localStorage, and the cart is
  // client-only state.
  if (import.meta.client) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) items.value = JSON.parse(raw) as CartItem[]
    }
    catch {
      // Ignore malformed/blocked storage — start with an empty cart.
    }

    watch(
      items,
      (value) => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
        }
        catch {
          // Ignore quota / disabled storage.
        }
      },
      { deep: true },
    )
  }

  // `skipHydrate` keeps Pinia from overwriting the localStorage-hydrated items
  // with the empty server payload (the cart is client-only persisted state).
  return {
    items: skipHydrate(items),
    isOpen,
    count,
    isEmpty,
    add,
    setQuantity,
    remove,
    clear,
    openDrawer,
    closeDrawer,
  }
})
