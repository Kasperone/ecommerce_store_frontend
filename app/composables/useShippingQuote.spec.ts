import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

/**
 * `useShippingQuote` invariants: debounce, single-flight (abort the superseded
 * request), reactive (country, currency, subtotal), and the empty-country reset.
 */

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }))

mockNuxtImport('useApi', () => () => ({ apiFetch: mockApiFetch }))

async function load() {
  const mod = await import('./useShippingQuote')
  return mod.useShippingQuote
}

const sample = {
  methods: [
    {
      id: 1,
      name: 'Standard',
      code: 'standard',
      description: null,
      sort_order: 10,
      amount: 19.99,
      currency: 'PLN',
      is_free: false,
      pricing_kind: 'flat',
      free_above_subtotal: null,
    },
  ],
}

beforeEach(() => {
  vi.useFakeTimers()
  mockApiFetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useShippingQuote', () => {
  it('debounces, then fetches and exposes the resolved methods', async () => {
    mockApiFetch.mockResolvedValue(sample)
    const useShippingQuote = await load()
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 99 })
    const { methods } = useShippingQuote(params)

    await nextTick()
    expect(mockApiFetch).not.toHaveBeenCalled() // still within the debounce
    await vi.advanceTimersByTimeAsync(250)

    expect(mockApiFetch).toHaveBeenCalledOnce()
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/shipping/quote',
      expect.objectContaining({
        query: expect.objectContaining({ country: 'PL', currency: 'PLN', subtotal: 99 }),
      }),
    )
    expect(methods.value).toHaveLength(1)
    expect(methods.value[0]!.id).toBe(1)
  })

  it('coalesces rapid (country, subtotal) changes into one request for the latest values', async () => {
    mockApiFetch.mockResolvedValue(sample)
    const useShippingQuote = await load()
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 10 })
    useShippingQuote(params)

    params.value = { country: 'PL', currency: 'PLN', subtotal: 20 }
    await nextTick()
    params.value = { country: 'PL', currency: 'PLN', subtotal: 30 }
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)

    expect(mockApiFetch).toHaveBeenCalledOnce()
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/shipping/quote',
      expect.objectContaining({
        query: expect.objectContaining({ subtotal: 30 }),
      }),
    )
  })

  it('skips the request and resets when the country goes empty', async () => {
    mockApiFetch.mockResolvedValue(sample)
    const useShippingQuote = await load()
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 10 })
    const { methods } = useShippingQuote(params)

    await vi.advanceTimersByTimeAsync(250)
    expect(mockApiFetch).toHaveBeenCalledOnce()

    mockApiFetch.mockClear()
    params.value = { country: '', currency: 'PLN', subtotal: 10 }
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)

    expect(mockApiFetch).not.toHaveBeenCalled()
    expect(methods.value).toEqual([])
  })

  it('aborts an in-flight quote when a newer one supersedes it', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
    mockApiFetch.mockImplementation(() => new Promise(() => {})) // never resolves
    const useShippingQuote = await load()
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 10 })
    useShippingQuote(params)

    await vi.advanceTimersByTimeAsync(250) // first request starts
    params.value = { country: 'PL', currency: 'PLN', subtotal: 20 }
    await nextTick()
    await vi.advanceTimersByTimeAsync(250) // second request aborts the first

    expect(abortSpy).toHaveBeenCalled()
    abortSpy.mockRestore()
  })

  it('flags failure and clears methods on a transport error', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'))
    const useShippingQuote = await load()
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 10 })
    const { methods, failed } = useShippingQuote(params)

    await vi.advanceTimersByTimeAsync(250)
    // Yield once more so the rejected promise's catch handler runs.
    await Promise.resolve()

    expect(failed.value).toBe(true)
    expect(methods.value).toEqual([])
  })

  it('does NOT flag failure on an abort (superseded request)', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    mockApiFetch.mockRejectedValue(abortError)
    const useShippingQuote = await load()
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 10 })
    const { failed } = useShippingQuote(params)

    await vi.advanceTimersByTimeAsync(250)
    await Promise.resolve()

    expect(failed.value).toBe(false)
  })

  it('clear() cancels pending work and resets state', async () => {
    mockApiFetch.mockResolvedValue(sample)
    const useShippingQuote = await load()
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 10 })
    const { methods, clear } = useShippingQuote(params)

    await vi.advanceTimersByTimeAsync(250)
    expect(methods.value).toHaveLength(1)

    clear()
    expect(methods.value).toEqual([])
  })

  it('threads weightKg through to the backend query (default 0)', async () => {
    mockApiFetch.mockResolvedValue(sample)
    const useShippingQuote = await load()
    // No weightKg supplied → backend should still receive 0 so the quote
    // matches a no-weight order (subtotal-only resolution preserved).
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 10 })
    useShippingQuote(params)
    await vi.advanceTimersByTimeAsync(250)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/shipping/quote',
      expect.objectContaining({
        query: expect.objectContaining({ weight_kg: 0 }),
      }),
    )
  })

  it('threads weightKg through when set (drives weight-tier resolution)', async () => {
    mockApiFetch.mockResolvedValue(sample)
    const useShippingQuote = await load()
    const params = ref({ country: 'PL', currency: 'PLN', subtotal: 100, weightKg: 2.5 })
    useShippingQuote(params)
    await vi.advanceTimersByTimeAsync(250)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/shipping/quote',
      expect.objectContaining({
        query: expect.objectContaining({ weight_kg: 2.5 }),
      }),
    )
  })
})
