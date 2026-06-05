import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCartStore } from '~/stores/cart'
import type { ProductWithCategory } from '#shared/types/api'

/**
 * "Buy again" / reorder support for the customer order pages.
 *
 * Re-adds an order's line items to the *client-side* Pinia cart, re-resolving
 * each product's CURRENT price + stock from `GET /api/v1/products/{id}` — the
 * historical `unit_price` snapshotted on the order line is never trusted. Items
 * whose product no longer exists, is inactive, or is out of stock (and not
 * backorderable) are skipped; a summary toast reports added vs skipped counts.
 *
 * No server-side order re-creation — this only hydrates the client cart (the
 * cart store owns checkout against `POST /orders/`).
 */

/** Minimal shape the reorder flow needs from an order line. */
export interface ReorderLine {
  product_id: number
  quantity: number
  product_name: string
}

export interface ReorderResult {
  added: number
  skipped: number
}

export function useReorder() {
  const { apiFetch } = useApi()
  const cart = useCartStore()
  const toast = useToast()
  const { t } = useI18n()

  const isReordering = ref(false)

  async function reorder(lines: ReorderLine[]): Promise<ReorderResult> {
    isReordering.value = true
    let added = 0
    let skipped = 0
    try {
      for (const line of lines) {
        let product: ProductWithCategory | null = null
        try {
          product = await apiFetch<ProductWithCategory>(
            `/api/v1/products/${line.product_id}`,
          )
        }
        catch {
          // Product no longer exists / not fetchable → skip.
          product = null
        }

        // Skip products that no longer exist, are inactive, or are out of stock
        // without backorder. The cart's `add()` also guards stock, but checking
        // here keeps the added/skipped tally accurate.
        if (!product || !product.is_active || (product.stock <= 0 && !product.allow_backorder)) {
          skipped += 1
          continue
        }

        cart.add(product, Math.max(line.quantity, 1))
        added += 1
      }
    }
    finally {
      isReordering.value = false
    }

    if (added > 0 && skipped === 0) {
      toast.add({
        title: t('orders.reorder.toast.allAddedTitle'),
        description: t('orders.reorder.toast.allAdded', { count: added }),
        color: 'success',
        icon: 'i-lucide-shopping-cart',
      })
    }
    else if (added > 0 && skipped > 0) {
      toast.add({
        title: t('orders.reorder.toast.partialTitle'),
        // Two independent counts can't share one pluralized message, so each
        // half is pluralized on its own count and composed via the wrapper.
        description: t('orders.reorder.toast.partial', {
          addedPart: t('orders.reorder.toast.partialAdded', { count: added }, added),
          skippedPart: t('orders.reorder.toast.partialSkipped', { count: skipped }, skipped),
        }),
        color: 'warning',
        icon: 'i-lucide-shopping-cart',
      })
    }
    else {
      toast.add({
        title: t('orders.reorder.toast.noneTitle'),
        description: t('orders.reorder.toast.none'),
        color: 'error',
        icon: 'i-lucide-alert-circle',
      })
    }

    if (added > 0) {
      cart.openDrawer()
    }

    return { added, skipped }
  }

  return { reorder, isReordering }
}
