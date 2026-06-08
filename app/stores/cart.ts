import { defineStore, skipHydrate } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ProductResponse, ProductVariantPublic, ProductWithCategory } from '#shared/types/api'

/**
 * Client-side shopping cart (Phase 2).
 *
 * Lines snapshot the product fields the cart needs to render — name, image,
 * all three currency prices, and stock — so the drawer/page show correctly in
 * any selected currency (see `useCurrencyPreference` + `shared/utils/money.ts`)
 * without re-fetching, and quantities can be clamped to available stock.
 *
 * Line identity is the `(productId, variantId)` pair (variants F2): the same
 * product in two variants is two lines, while a variantless product keeps
 * `variantId: null`. Old persisted carts predate `variantId` — predicates
 * compare with `?? null` so a missing key and an explicit null are the same
 * line (no duplicate lines after upgrade).
 *
 * State is persisted to `localStorage` on the client only; the cart is
 * client-only state, so its UI (header badge, drawer, /cart page) must render
 * client-side to avoid SSR hydration mismatches. Order creation happens at
 * checkout (Phase 3) against `POST /orders/`.
 */

export interface CartItem {
  productId: number
  // null for variantless products; also absent on pre-variants persisted carts
  // (treated as null everywhere via `?? null`).
  variantId?: number | null
  // Denormalized variant title snapshots ("Red / XL") for locale-aware display
  // in the drawer / cart page / checkout summary.
  variantTitle?: string | null
  variantTitlePl?: string | null
  slug: string
  name: string
  // Analytics product id source (Pillars C/D): the variant SKU when present,
  // else the product SKU, else null → callers fall back to `prod_{productId}`
  // via `analyticsItemId`. Snapshotted so cart/checkout events don't refetch.
  // Older persisted carts lack it → treated as null (→ prod_{id}).
  sku?: string | null
  imageUrl: string | null
  price_usd: number | null
  price_pln: number | null
  price_eur: number | null
  stock: number
  // Snapshotted so the cart can allow quantities beyond stock for backorder
  // products without refetching. Older persisted carts lack it → treated as false.
  allowBackorder: boolean
  // Snapshotted so the checkout's shipping quote can compute cart weight
  // without re-fetching every product. null/undefined means "no weight set"
  // (legacy product) — sums as 0 in the quote, matching the backend's
  // null-weight treatment.
  weightKg?: number | null
  // Dimensions snapshotted so the checkout's shipping quote can compute
  // cart volume (for the volumetric-weight branch) without re-fetching.
  // Any of the three null/undefined → that line contributes 0 to cart
  // volume (matches the backend's "any-dim NULL" safety).
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  quantity: number
}

type AddableProduct = Pick<
  ProductResponse | ProductWithCategory,
  | 'id'
  | 'slug'
  | 'name'
  | 'images'
  | 'price_usd'
  | 'price_pln'
  | 'price_eur'
  | 'stock'
  | 'allow_backorder'
  | 'sku'
  | 'weight_kg'
  | 'length_cm'
  | 'width_cm'
  | 'height_cm'
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

  // Line identity is the (productId, variantId) pair. `?? null` on BOTH sides:
  // old persisted carts have no `variantId` key, and a variantless add passes
  // null/undefined — they must match the same line (risk 4 back-compat).
  function lineMatches(item: CartItem, productId: number, variantId?: number | null): boolean {
    return item.productId === productId && (item.variantId ?? null) === (variantId ?? null)
  }

  function remove(productId: number, variantId: number | null = null) {
    items.value = items.value.filter(item => !lineMatches(item, productId, variantId))
  }

  function add(product: AddableProduct, quantity = 1, variant: ProductVariantPublic | null = null) {
    // Per-line stock grain: the variant's stock when present, else the product's.
    const stock = variant ? variant.stock : product.stock
    // Out of stock blocks adding only when backorder isn't allowed (backorder
    // stays product-level even for variant products).
    if (stock <= 0 && !product.allow_backorder) return
    const existing = items.value.find(item => lineMatches(item, product.id, variant?.id))
    if (existing) {
      const next = existing.quantity + quantity
      existing.quantity = product.allow_backorder ? next : Math.min(next, stock)
      return
    }
    items.value.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantTitle: variant?.title ?? null,
      variantTitlePl: variant?.title_pl ?? null,
      slug: product.slug,
      name: product.name,
      // Analytics id source: prefer the variant SKU, else the product SKU.
      sku: variant?.sku ?? product.sku ?? null,
      // A variant with its own gallery image shows that image on the line.
      imageUrl: variant?.image_url ?? primaryImageUrl(product),
      // Variant prices are the EFFECTIVE per-currency values (inheritance
      // already resolved by the backend) — see ProductVariantPublic.
      price_usd: variant ? variant.price_usd ?? null : product.price_usd,
      price_pln: variant ? variant.price_pln ?? null : product.price_pln,
      price_eur: variant ? variant.price_eur ?? null : product.price_eur,
      stock,
      allowBackorder: product.allow_backorder,
      weightKg: product.weight_kg ?? null,
      lengthCm: product.length_cm ?? null,
      widthCm: product.width_cm ?? null,
      heightCm: product.height_cm ?? null,
      quantity: product.allow_backorder
        ? Math.max(quantity, 1)
        : Math.min(Math.max(quantity, 1), stock),
    })
  }

  function setQuantity(productId: number, variantId: number | null, quantity: number) {
    const item = items.value.find(item => lineMatches(item, productId, variantId))
    if (!item) return
    if (quantity <= 0) {
      remove(productId, variantId)
      return
    }
    // Backorder lines aren't clamped to stock; everything else is.
    item.quantity = item.allowBackorder ? quantity : Math.min(quantity, item.stock)
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
