import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

/**
 * `useSearchSuggest` invariants: debounce, single-flight (abort the superseded
 * request), result mapping, and the empty-query reset. `useApi` + `useI18n` are
 * mocked so no Nuxt app context / network is needed.
 */

const { mockApiFetch, localeRef } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  localeRef: { value: 'en' },
}))

mockNuxtImport('useApi', () => () => ({ apiFetch: mockApiFetch }))
mockNuxtImport('useI18n', () => () => ({ locale: localeRef }))

async function loadComposable() {
  const mod = await import('./useSearchSuggest')
  return mod.useSearchSuggest
}

const sampleResponse = {
  products: [{ id: 1, slug: 'phone', name: 'Phone', name_highlight: 'Phone' }],
  categories: [{ id: 3, slug: 'electronics', name: 'Electronics' }],
  query: 'phone',
}

beforeEach(() => {
  vi.useFakeTimers()
  mockApiFetch.mockReset()
  localeRef.value = 'en'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSearchSuggest', () => {
  it('debounces, then fetches and maps suggestions', async () => {
    mockApiFetch.mockResolvedValue(sampleResponse)
    const useSearchSuggest = await loadComposable()
    const query = ref('')
    const { products, categories } = useSearchSuggest(query)

    query.value = 'phone'
    await nextTick()
    expect(mockApiFetch).not.toHaveBeenCalled() // still within the debounce window

    await vi.advanceTimersByTimeAsync(250)
    expect(mockApiFetch).toHaveBeenCalledOnce()
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/search/suggest',
      expect.objectContaining({ query: expect.objectContaining({ q: 'phone', locale: 'en', limit: 5 }) }),
    )
    expect(products.value).toHaveLength(1)
    expect(categories.value).toHaveLength(1)
  })

  it('coalesces rapid keystrokes into a single request for the latest value', async () => {
    mockApiFetch.mockResolvedValue(sampleResponse)
    const useSearchSuggest = await loadComposable()
    const query = ref('')
    useSearchSuggest(query)

    query.value = 'p'
    await nextTick()
    query.value = 'ph'
    await nextTick()
    query.value = 'pho'
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)

    expect(mockApiFetch).toHaveBeenCalledOnce()
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/search/suggest',
      expect.objectContaining({ query: expect.objectContaining({ q: 'pho' }) }),
    )
  })

  it('passes the active locale through to the backend', async () => {
    mockApiFetch.mockResolvedValue(sampleResponse)
    localeRef.value = 'pl'
    const useSearchSuggest = await loadComposable()
    const query = ref('')
    useSearchSuggest(query)

    query.value = 'słuchawki'
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/search/suggest',
      expect.objectContaining({ query: expect.objectContaining({ locale: 'pl' }) }),
    )
  })

  it('resets results and skips the request when the query is emptied', async () => {
    const useSearchSuggest = await loadComposable()
    const query = ref('phone')
    const { products } = useSearchSuggest(query)

    query.value = ''
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    expect(mockApiFetch).not.toHaveBeenCalled()
    expect(products.value).toEqual([])
  })

  it('aborts an in-flight request when a newer query supersedes it', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
    mockApiFetch.mockImplementation(() => new Promise(() => {})) // never resolves
    const useSearchSuggest = await loadComposable()
    const query = ref('')
    useSearchSuggest(query)

    query.value = 'ph'
    await nextTick()
    await vi.advanceTimersByTimeAsync(250) // first request starts
    query.value = 'pho'
    await nextTick()
    await vi.advanceTimersByTimeAsync(250) // second request aborts the first

    expect(abortSpy).toHaveBeenCalled()
    abortSpy.mockRestore()
  })

  it('flags failure and clears results when the request errors', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'))
    const useSearchSuggest = await loadComposable()
    const query = ref('')
    const { products, failed } = useSearchSuggest(query)

    query.value = 'phone'
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    expect(failed.value).toBe(true)
    expect(products.value).toEqual([])
  })
})
