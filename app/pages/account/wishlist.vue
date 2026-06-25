<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney, selectPrice } from '#shared/utils/money'
import {
  useRemoveFromWishlist,
  useWishlistQuery,
  type WishlistItem,
} from '~/composables/queries/useWishlistQueries'

/**
 * Wishlist: the products the shopper has saved for later. The list comes from
 * the client-gated Colada query; remove is a non-optimistic mutation that
 * invalidates the namespace so the list refetches.
 *
 * Inactive / out-of-stock items are still returned by the API (so a shopper can
 * remove a now-unavailable save) — they render greyed out with a badge rather
 * than vanishing. Prices come straight off the row's per-currency columns and
 * are formatted for the shopper's chosen currency (`useCurrencyPreference`).
 */

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { currency } = useCurrencyPreference()

useHead({
  title: () => t('wishlist.title'),
})

const { data: items, isLoading } = useWishlistQuery()
const { mutateAsync: removeItem } = useRemoveFromWishlist()

const count = computed(() => items.value?.length ?? 0)

function productTo(item: WishlistItem) {
  return localePath(`/products/${item.product_slug}`)
}

function displayName(item: WishlistItem) {
  return locale.value === 'pl' && item.product_name_pl ? item.product_name_pl : item.product_name
}

function formattedPrice(item: WishlistItem) {
  const picked = selectPrice(item, currency.value)
  return picked ? formatMoney(picked.amount, picked.currency, locale.value) : null
}

function variantLabel(item: WishlistItem) {
  return item.variant_title ?? item.variant_sku ?? null
}

// ---- Remove ----

const removingId = ref<number | null>(null)

async function onRemove(item: WishlistItem) {
  removingId.value = item.id
  try {
    await removeItem(item.id)
    toast.add({ title: t('wishlist.removedToast'), color: 'success' })
  }
  catch {
    toast.add({ title: t('wishlist.removeError'), color: 'error' })
  }
  finally {
    removingId.value = null
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-wishlist p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 class="text-2xl font-bold">
          {{ t('wishlist.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('wishlist.subtitle') }}
        </p>
        <ClientOnly>
          <p
            v-if="count > 0"
            class="mt-1 text-sm text-muted"
          >
            {{ t('wishlist.count', count, { count }) }}
          </p>
        </ClientOnly>
      </div>

      <ClientOnly>
        <div
          v-if="isLoading && count === 0"
          class="py-8 text-center text-gray-500"
        >
          {{ t('wishlist.loading') }}
        </div>

        <div
          v-else-if="count === 0"
          class="rounded-lg border border-dashed border-gray-300 py-12 text-center
            dark:border-gray-700"
        >
          <UIcon
            name="i-lucide-heart"
            class="mx-auto mb-2 size-8 text-gray-400"
          />
          <p class="mb-4 text-gray-600 dark:text-gray-400">
            {{ t('wishlist.empty') }}
          </p>
          <UButton
            :to="localePath('/products')"
            color="primary"
            icon="i-lucide-shopping-bag"
          >
            {{ t('wishlist.emptyCta') }}
          </UButton>
        </div>

        <div
          v-else
          class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <article
            v-for="item in items"
            :key="item.id"
            class="flex flex-col rounded-lg border border-gray-200 p-3 dark:border-gray-800"
            :class="{ 'opacity-60': !item.is_active || !item.in_stock }"
          >
            <NuxtLink
              :to="productTo(item)"
              class="block"
              :aria-label="displayName(item)"
            >
              <div
                class="relative aspect-square overflow-hidden rounded-md bg-gray-100
                  dark:bg-gray-800"
              >
                <NuxtImg
                  v-if="item.product_image_url"
                  :src="item.product_image_url"
                  :alt="displayName(item)"
                  width="300"
                  height="300"
                  sizes="xs:50vw sm:33vw lg:25vw"
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center text-muted"
                >
                  <UIcon
                    name="i-lucide-image"
                    class="size-10"
                  />
                </div>
                <UBadge
                  v-if="!item.is_active"
                  color="neutral"
                  variant="solid"
                  class="absolute left-2 top-2"
                >
                  {{ t('wishlist.unavailable') }}
                </UBadge>
                <UBadge
                  v-else-if="!item.in_stock"
                  color="neutral"
                  variant="solid"
                  class="absolute left-2 top-2"
                >
                  {{ t('wishlist.outOfStock') }}
                </UBadge>
              </div>
            </NuxtLink>

            <div class="mt-3 flex flex-1 flex-col gap-1">
              <NuxtLink
                :to="productTo(item)"
                class="font-medium hover:text-primary line-clamp-2"
              >
                {{ displayName(item) }}
              </NuxtLink>
              <p
                v-if="variantLabel(item)"
                class="text-sm text-muted"
              >
                {{ variantLabel(item) }}
              </p>
              <span
                v-if="formattedPrice(item)"
                class="font-medium"
              >{{ formattedPrice(item) }}</span>
              <span
                v-else
                class="text-sm text-muted"
              >—</span>

              <div class="mt-auto pt-2">
                <UButton
                  color="neutral"
                  variant="soft"
                  block
                  icon="i-lucide-trash-2"
                  :loading="removingId === item.id"
                  :aria-label="t('wishlist.removeAria')"
                  @click="onRemove(item)"
                >
                  {{ t('wishlist.remove') }}
                </UButton>
              </div>
            </div>
          </article>
        </div>

        <template #fallback>
          <div class="py-8 text-center text-gray-500">
            {{ t('wishlist.loading') }}
          </div>
        </template>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
