// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

/**
 * Public storefront collection composables. We stub `useAsyncData` to capture
 * the fetcher closure (so no real network) and a fake `apiFetch` to assert the
 * exact URL each composable hits.
 */

const { apiFetch, capturedFetchers } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  capturedFetchers: new Map<string, () => unknown>(),
}))

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

mockNuxtImport('useAsyncData', () => {
  return (key: string, fetcher: () => unknown) => {
    capturedFetchers.set(key, fetcher)
    return { data: { value: undefined }, error: { value: null }, status: { value: 'idle' } }
  }
})

beforeEach(() => {
  apiFetch.mockReset()
  capturedFetchers.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCollectionsListPublic', () => {
  it('fetches the public active-collections list', async () => {
    apiFetch.mockResolvedValue([])
    const { useCollectionsListPublic } = await import('./useCatalog')

    useCollectionsListPublic()
    await capturedFetchers.get('storefront-collections')!()

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/collections/')
  })
})

describe('useCollectionDetail', () => {
  it('fetches a collection by slug from the public-by-slug path', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'Summer', slug: 'summer' })
    const { useCollectionDetail } = await import('./useCatalog')

    useCollectionDetail('summer')
    await capturedFetchers.get('storefront-collection-summer')!()

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/collections/slug/summer')
  })

  it('URL-encodes the slug', async () => {
    apiFetch.mockResolvedValue({})
    const { useCollectionDetail } = await import('./useCatalog')

    useCollectionDetail('lato i jesień')
    await capturedFetchers.get('storefront-collection-lato i jesień')!()

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/collections/slug/lato%20i%20jesie%C5%84')
  })
})
