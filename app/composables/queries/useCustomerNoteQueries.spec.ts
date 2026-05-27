import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin customer notes. Specs assert on
 * the URLs and verbs pushed at `apiFetch`.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function runInComponent(setupFn: () => unknown) {
  let captured: unknown
  const harness = defineComponent({
    setup() {
      captured = setupFn()
      return () => h('div')
    },
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  mount(harness, { global: { plugins: [pinia, PiniaColada] } })
  await nextTick()
  return captured
}

describe('useCustomerNotesQuery', () => {
  it('fetches /api/v1/admin/customers/{id}/notes', async () => {
    apiFetch.mockResolvedValue([])
    const { useCustomerNotesQuery } = await import('./useCustomerNoteQueries')

    await runInComponent(() => useCustomerNotesQuery(7))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/customers/7/notes')
  })

  it('does not fetch when id is undefined', async () => {
    const { useCustomerNotesQuery } = await import('./useCustomerNoteQueries')

    await runInComponent(() => useCustomerNotesQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useCreateNote', () => {
  it('POSTs /api/v1/admin/customers/{id}/notes with the body', async () => {
    apiFetch.mockResolvedValue({ id: 1, body: 'hi' })
    const { useCreateNote } = await import('./useCustomerNoteQueries')

    const result = await runInComponent(() => useCreateNote()) as any
    await result.mutateAsync({ customerId: 4, body: { body: 'hi' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/4/notes')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ body: 'hi' })
  })
})

describe('useUpdateNote', () => {
  it('PATCHes /api/v1/admin/customers/{id}/notes/{noteId}', async () => {
    apiFetch.mockResolvedValue({ id: 9, body: 'new' })
    const { useUpdateNote } = await import('./useCustomerNoteQueries')

    const result = await runInComponent(() => useUpdateNote()) as any
    await result.mutateAsync({ customerId: 4, noteId: 9, body: { body: 'new' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/4/notes/9')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ body: 'new' })
  })
})

describe('useDeleteNote', () => {
  it('DELETEs /api/v1/admin/customers/{id}/notes/{noteId}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteNote } = await import('./useCustomerNoteQueries')

    const result = await runInComponent(() => useDeleteNote()) as any
    await result.mutateAsync({ customerId: 4, noteId: 9 })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/customers/4/notes/9')
    expect(options.method).toBe('DELETE')
  })
})
