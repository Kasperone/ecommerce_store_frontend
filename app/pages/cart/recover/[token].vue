<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildApiUrl } from '#shared/constants/api'
import type { RecoveredCartResponse } from '#shared/types/api'
import { CART_RECOVERY_GENERIC_KEY, cartRecoveryErrorKey } from '#shared/utils/cartRecoveryStatus'
import { parseProblem } from '#shared/utils/problemDetails'

/**
 * Abandoned-cart recovery landing page (`/cart/recover/<token>`), public.
 *
 * The opaque token from the recovery email restores CART CONTENTS ONLY — it
 * never authenticates. `GET /carts/recover/{token}` returns fresh catalog data
 * per line; we merge it into the local Pinia cart (additive — existing local
 * lines keep their quantity, plan D6) and redirect to /cart for the normal
 * checkout flow.
 *
 * The cart is client-only state, so the fetch runs in `onMounted` (never SSR).
 * Failures render one of the machine-code-keyed states — see
 * `shared/utils/cartRecoveryStatus.ts`.
 */

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const cart = useCartStore()
const { apiFetch } = useApi()

const token = route.params.token as string

type RecoverStatus = 'loading' | 'empty' | 'error'
const status = ref<RecoverStatus>('loading')
const errorKey = ref(CART_RECOVERY_GENERIC_KEY)
const isGenericError = computed(() => errorKey.value === CART_RECOVERY_GENERIC_KEY)
const isAlreadyOrdered = computed(() => errorKey.value === 'cart.recover.alreadyOrdered')

useHead({ title: () => t('cart.recover.title') })

async function recover() {
  status.value = 'loading'
  try {
    const res = await apiFetch<RecoveredCartResponse>(buildApiUrl.cartRecover(token))
    // Generated schema marks `items`/`variant` optional (Pydantic defaults);
    // normalize at the boundary — the store's RecoveredCartLine requires both.
    const lines = (res.items ?? []).map(item => ({
      quantity: item.quantity,
      product: item.product,
      variant: item.variant ?? null,
    }))
    if (lines.length === 0) {
      // Every snapshotted line is gone/inactive — nothing to restore.
      status.value = 'empty'
      return
    }
    cart.mergeRecovered(lines)
    toast.add({ title: t('cart.recover.restored'), color: 'success' })
    await navigateTo(localePath({ path: '/cart' }))
  }
  catch (error) {
    errorKey.value = cartRecoveryErrorKey(parseProblem(error)?.detail)
    status.value = 'error'
  }
}

onMounted(() => {
  void recover()
})
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-2xl px-4 py-16">
      <div
        v-if="status === 'loading'"
        class="flex flex-col items-center gap-4 text-center"
        data-testid="recover-loading"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-10 animate-spin text-muted"
        />
        <p class="text-muted">
          {{ t('cart.recover.restoring') }}
        </p>
      </div>

      <div
        v-else-if="status === 'empty'"
        class="flex flex-col items-center gap-4 text-center"
        data-testid="recover-empty"
      >
        <UIcon
          name="i-lucide-shopping-cart"
          class="size-12 text-muted"
        />
        <h1 class="text-xl font-semibold">
          {{ t('cart.recover.title') }}
        </h1>
        <p class="text-muted">
          {{ t('cart.recover.empty') }}
        </p>
        <UButton
          color="primary"
          :to="localePath({ path: '/products' })"
        >
          {{ t('cart.recover.browseProducts') }}
        </UButton>
      </div>

      <div
        v-else
        class="flex flex-col items-center gap-4 text-center"
        data-testid="recover-error"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="size-12 text-muted"
        />
        <h1 class="text-xl font-semibold">
          {{ t('cart.recover.title') }}
        </h1>
        <p
          class="text-muted"
          data-testid="recover-error-message"
        >
          {{ t(errorKey) }}
        </p>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <UButton
            v-if="isGenericError"
            color="primary"
            data-testid="recover-retry"
            @click="recover"
          >
            {{ t('cart.recover.retry') }}
          </UButton>
          <UButton
            v-if="isAlreadyOrdered"
            color="primary"
            :to="localePath({ path: '/account/orders' })"
            data-testid="recover-view-orders"
          >
            {{ t('cart.recover.viewOrders') }}
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            :to="localePath({ path: '/cart' })"
          >
            {{ t('cart.recover.backToCart') }}
          </UButton>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
