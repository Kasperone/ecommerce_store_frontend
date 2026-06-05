<script setup lang="ts">
/**
 * Meilisearch-backed autocomplete for `product` / `collection` settings in the
 * CMS schema form.
 *
 * Reuses the storefront `/search/suggest` endpoint (the same engine that powers
 * the header search box) via the `useSearchSuggest` composable. The chosen value
 * is the product **id** (number) or the collection **slug** (string) — what the
 * backend block settings expect.
 *
 * Two modes:
 *  - `mode="product"`  → emits the product id (number). With `multiple`, emits a
 *    `number[]`.
 *  - `mode="collection"` → emits the category slug (string), single-value only.
 *
 * This is an admin-only, client-typed control, so it fetches transiently with no
 * SSR concern (matches `useSearchSuggest`'s own design note).
 */
import { computed, ref } from 'vue'

const props = defineProps<{
  /** `product` resolves to ids; `collection` resolves to a category slug. */
  mode: 'product' | 'collection'
  /** Selected value: a product id / id[] (product mode) or a slug (collection mode). */
  modelValue: unknown
  /** Allow multiple products (ignored in collection mode). */
  multiple?: boolean
  label?: string
  id?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const { t } = useI18n()

const term = ref('')
const { products, categories, loading, clear } = useSearchSuggest(() => term.value)

const isProduct = computed(() => props.mode === 'product')
const allowMultiple = computed(() => isProduct.value && props.multiple === true)

/** Current selection normalised to a number[] (products) — slug stays a string. */
const selectedIds = computed<number[]>(() => {
  if (!isProduct.value) return []
  const v = props.modelValue
  if (Array.isArray(v)) return v.filter((n): n is number => typeof n === 'number')
  if (typeof v === 'number') return [v]
  return []
})

const selectedSlug = computed<string>(() =>
  !isProduct.value && typeof props.modelValue === 'string' ? props.modelValue : '',
)

/**
 * Cache the labels of chosen products so the chips stay readable after the
 * suggestion list changes (the picker only knows ids otherwise).
 */
const labelCache = ref<Record<number, string>>({})

function nameForId(productId: number): string {
  return labelCache.value[productId] ?? `#${productId}`
}

function pickProduct(productId: number, name: string) {
  labelCache.value = { ...labelCache.value, [productId]: name }
  if (allowMultiple.value) {
    if (selectedIds.value.includes(productId)) return
    emit('update:modelValue', [...selectedIds.value, productId])
  }
  else {
    emit('update:modelValue', productId)
  }
  term.value = ''
  clear()
}

function removeProduct(productId: number) {
  if (allowMultiple.value) {
    emit('update:modelValue', selectedIds.value.filter(n => n !== productId))
  }
  else {
    emit('update:modelValue', null)
  }
}

function pickCollection(slug: string) {
  emit('update:modelValue', slug)
  term.value = ''
  clear()
}

function clearCollection() {
  emit('update:modelValue', null)
}

const hasSuggestions = computed(() =>
  isProduct.value ? products.value.length > 0 : categories.value.length > 0,
)
</script>

<template>
  <div class="space-y-2">
    <!-- Product chips -->
    <div
      v-if="isProduct && selectedIds.length"
      class="flex flex-wrap gap-1.5"
    >
      <UBadge
        v-for="pid in selectedIds"
        :key="pid"
        color="primary"
        variant="subtle"
        class="gap-1"
      >
        {{ nameForId(pid) }}
        <button
          type="button"
          class="ml-0.5 hover:opacity-70"
          :aria-label="t('admin.cms.picker.remove')"
          @click="removeProduct(pid)"
        >
          <UIcon
            name="i-lucide-x"
            class="size-3"
          />
        </button>
      </UBadge>
    </div>

    <!-- Collection single selection -->
    <div
      v-if="!isProduct && selectedSlug"
      class="flex items-center gap-2"
    >
      <UBadge
        color="primary"
        variant="subtle"
      >
        {{ selectedSlug }}
      </UBadge>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-x"
        :aria-label="t('admin.cms.picker.clear')"
        @click="clearCollection"
      />
    </div>

    <UInput
      :id="id"
      v-model="term"
      :loading="loading"
      icon="i-lucide-search"
      :placeholder="isProduct ? t('admin.cms.picker.searchProducts') : t('admin.cms.picker.searchCollections')"
      class="w-full"
    />

    <ul
      v-if="term.trim() && hasSuggestions"
      class="border border-default rounded-md divide-y divide-default max-h-56 overflow-auto"
    >
      <template v-if="isProduct">
        <li
          v-for="p in products"
          :key="p.id"
        >
          <button
            type="button"
            class="w-full text-left px-3 py-2 text-sm hover:bg-elevated flex items-center gap-2"
            @click="pickProduct(p.id, p.name)"
          >
            <img
              v-if="p.image_url"
              :src="p.image_url"
              :alt="p.name"
              class="h-8 w-8 rounded object-cover bg-elevated shrink-0"
            >
            <span class="truncate">{{ p.name }}</span>
          </button>
        </li>
      </template>
      <template v-else>
        <li
          v-for="c in categories"
          :key="c.id"
        >
          <button
            type="button"
            class="w-full text-left px-3 py-2 text-sm hover:bg-elevated"
            @click="pickCollection(c.slug)"
          >
            <span class="font-medium">{{ c.name }}</span>
            <span class="text-muted ml-1">/{{ c.slug }}</span>
          </button>
        </li>
      </template>
    </ul>

    <p
      v-else-if="term.trim() && !loading"
      class="text-muted text-xs"
    >
      {{ t('admin.cms.picker.noResults') }}
    </p>
  </div>
</template>
