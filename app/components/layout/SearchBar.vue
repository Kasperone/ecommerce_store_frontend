<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@vueuse/core'

/**
 * Header search box + instant autocomplete dropdown. The input renders on the
 * server (empty, dropdown closed) so there is no hydration mismatch; suggestions
 * are fetched client-side only, as the shopper types (see `useSearchSuggest`).
 * Enter or the "see all results" row goes to the full faceted `/search` page.
 */

const { t } = useI18n()
const localePath = useLocalePath()

const query = ref('')
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const { products, categories, loading, failed, hasResults, clear } = useSearchSuggest(query)

onClickOutside(root, () => {
  open.value = false
})

const trimmed = computed(() => query.value.trim())
const showDropdown = computed(() => open.value && trimmed.value.length > 0)

function goToSearch() {
  if (!trimmed.value) return
  open.value = false
  navigateTo({ path: localePath('/search'), query: { q: trimmed.value } })
}

function onSelect() {
  open.value = false
  query.value = ''
  clear()
}
</script>

<template>
  <div
    ref="root"
    class="relative w-full max-w-xs"
  >
    <UInput
      v-model="query"
      icon="i-lucide-search"
      :placeholder="t('search.placeholder')"
      :loading="loading"
      :aria-label="t('search.ariaLabel')"
      class="w-full"
      autocomplete="off"
      @focus="open = true"
      @keydown.enter="goToSearch"
      @keydown.escape="open = false"
    />

    <div
      v-if="showDropdown"
      :class="[
        'absolute z-50 mt-1 w-full overflow-hidden rounded-lg',
        'border border-default bg-default shadow-lg',
      ]"
    >
      <!-- Product hits -->
      <div v-if="products.length">
        <p class="px-3 pt-2 pb-1 text-xs font-semibold text-muted uppercase">
          {{ t('search.sections.products') }}
        </p>
        <NuxtLink
          v-for="product in products"
          :key="`p-${product.id}`"
          :to="localePath(`/products/${product.slug}`)"
          class="flex items-center gap-3 px-3 py-2 hover:bg-elevated"
          @click="onSelect"
        >
          <img
            v-if="product.image_url"
            :src="product.image_url"
            :alt="product.name"
            class="size-10 shrink-0 rounded object-cover"
            loading="lazy"
          >
          <span
            v-else
            class="flex size-10 shrink-0 items-center justify-center rounded bg-elevated text-muted"
          >
            <UIcon
              name="i-lucide-image"
              class="size-5"
            />
          </span>
          <span class="min-w-0 flex-1 truncate">{{ product.name }}</span>
          <ShopPriceDisplay
            :product="product"
            class="shrink-0 text-sm"
          />
        </NuxtLink>
      </div>

      <!-- Category shortcuts -->
      <div
        v-if="categories.length"
        class="border-t border-default"
      >
        <p class="px-3 pt-2 pb-1 text-xs font-semibold text-muted uppercase">
          {{ t('search.sections.categories') }}
        </p>
        <NuxtLink
          v-for="category in categories"
          :key="`c-${category.id}`"
          :to="localePath(`/category/${category.slug}`)"
          class="flex items-center gap-2 px-3 py-2 hover:bg-elevated"
          @click="onSelect"
        >
          <UIcon
            name="i-lucide-folder"
            class="size-4 shrink-0 text-muted"
          />
          <span class="truncate">{{ category.name }}</span>
        </NuxtLink>
      </div>

      <!-- No matches -->
      <p
        v-if="!loading && !hasResults && !failed"
        class="px-3 py-3 text-sm text-muted"
      >
        {{ t('search.noResults', { query: trimmed }) }}
      </p>

      <!-- See all results -->
      <button
        type="button"
        :class="[
          'flex w-full items-center gap-2 border-t border-default px-3 py-2',
          'text-sm font-medium text-primary hover:bg-elevated',
        ]"
        @click="goToSearch"
      >
        <UIcon
          name="i-lucide-search"
          class="size-4"
        />
        {{ t('search.seeAll', { query: trimmed }) }}
      </button>
    </div>
  </div>
</template>
