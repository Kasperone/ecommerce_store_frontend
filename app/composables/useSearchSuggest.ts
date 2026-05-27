/**
 * Debounced autocomplete suggestions for the header search bar.
 *
 * Public + transient, so it fetches via `useApi().apiFetch` directly (no Pinia
 * Colada, no `useAsyncData`) — there is no SSR-hydration concern because the
 * query only ever changes from client-side typing. Each keystroke debounces
 * (~250 ms) and aborts the previous in-flight request so a slow earlier
 * response can't overwrite a newer one.
 */

import { ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { API_ENDPOINTS } from '#shared/constants/api'
import type { SuggestCategoryItem, SuggestProductItem, SuggestResponse } from '#shared/types/api'

const DEBOUNCE_MS = 250
const MIN_QUERY_LEN = 1
const SUGGEST_LIMIT = 5

export function useSearchSuggest(query: MaybeRefOrGetter<string>) {
  const { apiFetch } = useApi()
  const { locale } = useI18n()

  const products = ref<SuggestProductItem[]>([])
  const categories = ref<SuggestCategoryItem[]>([])
  const loading = ref(false)
  const failed = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let activeController: AbortController | undefined

  function reset() {
    products.value = []
    categories.value = []
    loading.value = false
    failed.value = false
  }

  async function run(q: string) {
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    loading.value = true
    failed.value = false
    try {
      const res = await apiFetch<SuggestResponse>(API_ENDPOINTS.SEARCH.SUGGEST, {
        query: { q, locale: locale.value, limit: SUGGEST_LIMIT },
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      products.value = res.products
      categories.value = res.categories
    }
    catch (err) {
      // A superseded request was aborted on purpose — ignore it.
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return
      failed.value = true
      products.value = []
      categories.value = []
    }
    finally {
      if (activeController === controller) loading.value = false
    }
  }

  watch(
    () => toValue(query),
    (raw) => {
      clearTimeout(debounceTimer)
      const trimmed = raw.trim()
      if (trimmed.length < MIN_QUERY_LEN) {
        activeController?.abort()
        reset()
        return
      }
      debounceTimer = setTimeout(() => void run(trimmed), DEBOUNCE_MS)
    },
  )

  /** Cancel any pending debounce/request and clear results (on blur/close). */
  function clear() {
    clearTimeout(debounceTimer)
    activeController?.abort()
    reset()
  }

  const hasResults = computed(() => products.value.length > 0 || categories.value.length > 0)

  return { products, categories, loading, failed, hasResults, clear }
}
