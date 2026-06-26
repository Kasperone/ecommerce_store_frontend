<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProductResponse, ProductVariantPublic, ProductWithCategory } from '#shared/types/api'
import {
  useAddToWishlist,
  useRemoveFromWishlist,
  useWishlist,
} from '~/composables/queries/useWishlistQueries'

/**
 * Heart toggle for saving a product (optionally a resolved variant) to the
 * caller's wishlist. Reused on the PDP (icon + label) and the account tiles
 * (icon only, via `:icon-only`).
 *
 * Auth-gating: a guest click routes to `/login?redirect=<return>` (preserving
 * the current path), mirroring the storefront's other authed actions (e.g. the
 * review form's sign-in link). An authed click toggles add/remove against the
 * currently-selected variant. Impersonation is view-only, so an admin "viewing
 * as" a customer can't mutate their wishlist.
 */
const props = defineProps<{
  product: ProductResponse | ProductWithCategory
  variant?: ProductVariantPublic | null
  iconOnly?: boolean
  block?: boolean
}>()

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()

const { isInWishlist, findItem } = useWishlist()
const { mutateAsync: add } = useAddToWishlist()
const { mutateAsync: remove } = useRemoveFromWishlist()

const variantId = computed(() => props.variant?.id ?? null)
const saved = computed(() => isInWishlist(props.product.id, variantId.value))
const busy = ref(false)

async function onClick() {
  if (auth.isImpersonating || busy.value) return

  if (!auth.isAuthenticated) {
    toast.add({ title: t('wishlist.signInPrompt'), color: 'info' })
    await navigateTo(localePath({ path: '/login', query: { redirect: route.fullPath } }))
    return
  }

  const wasSaved = saved.value
  busy.value = true
  try {
    if (wasSaved) {
      const existing = findItem(props.product.id, variantId.value)
      if (existing) await remove(existing.id)
      toast.add({ title: t('wishlist.removedToast'), color: 'success' })
    }
    else {
      await add({ product_id: props.product.id, variant_id: variantId.value })
      toast.add({ title: t('wishlist.added'), color: 'success' })
    }
  }
  catch {
    toast.add({
      title: wasSaved ? t('wishlist.removeError') : t('wishlist.addError'),
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UButton
    color="neutral"
    :variant="saved ? 'soft' : 'outline'"
    :block="block"
    :square="iconOnly"
    :loading="busy"
    :disabled="auth.isImpersonating"
    :aria-pressed="saved"
    :aria-label="saved ? t('wishlist.removeAria') : t('wishlist.addAria')"
    :title="auth.isImpersonating ? t('impersonation.writeBlocked') : undefined"
    @click="onClick"
  >
    <UIcon
      name="i-lucide-heart"
      class="size-4 shrink-0"
      :class="saved ? 'fill-current text-error' : ''"
    />
    <span v-if="!iconOnly">
      {{ saved ? t('wishlist.saved') : t('wishlist.save') }}
    </span>
  </UButton>
</template>
