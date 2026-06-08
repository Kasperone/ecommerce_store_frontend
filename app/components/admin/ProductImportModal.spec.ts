// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import ProductImportModal from './ProductImportModal.vue'

/**
 * The two-phase import UX, driven through the teleported modal DOM (UModal renders
 * into document.body). We stub useImportProducts' mutateAsync + useToast. Covers:
 * dry-run (dry_run=true) renders the report, apply calls dry_run=false + toasts
 * success + closes, apply is blocked when the dry-run report has errors, and the
 * all-or-nothing error report on apply is surfaced.
 */

const { mockMutate, mockToastAdd } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useImportProducts', () => () => ({
  mutateAsync: mockMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

function dryReport(overrides = {}) {
  return {
    dry_run: true,
    applied: false,
    summary: { creates: 2, updates: 1, skips: 0, errors: 0 },
    rows: [
      { row_number: 2, action: 'create', product_id: null, errors: [] },
      { row_number: 3, action: 'update', product_id: 5, errors: [] },
    ],
    ...overrides,
  }
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim().startsWith(text),
  ) as HTMLButtonElement | undefined
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

async function setFile() {
  const input = fileInput()
  const file = new File(['id,name\r\n'], 'p.csv', { type: 'text/csv' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ProductImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs a dry-run (dry_run=true) and renders the report', async () => {
    mockMutate.mockResolvedValue(dryReport())
    await mountSuspended(ProductImportModal, { props: { open: true } })

    await setFile()
    buttonByText('Validate')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(mockMutate).toHaveBeenCalledWith({ file: expect.any(File), dryRun: true })
    expect(mockMutate.mock.calls[0][0].dryRun).toBe(true)
    expect(document.body.textContent).toContain('2 to create')
    expect(document.body.textContent).toContain('1 to update')
  })

  it('disables apply when the dry-run report has errors', async () => {
    mockMutate.mockResolvedValue(dryReport({
      summary: { creates: 0, updates: 0, skips: 0, errors: 1 },
      rows: [{ row_number: 2, action: 'error', product_id: null, errors: ['bad price'] }],
    }))
    await mountSuspended(ProductImportModal, { props: { open: true } })

    await setFile()
    buttonByText('Validate')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(document.body.textContent).toContain('bad price')
    expect(buttonByText('Apply')?.disabled).toBe(true)
  })

  it('applies with dry_run=false, toasts success, and closes', async () => {
    mockMutate
      .mockResolvedValueOnce(dryReport())
      .mockResolvedValueOnce({
        dry_run: false,
        applied: true,
        summary: { creates: 2, updates: 1, skips: 0, errors: 0 },
        rows: [],
      })
    const wrapper = await mountSuspended(ProductImportModal, { props: { open: true } })

    await setFile()
    buttonByText('Validate')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(buttonByText('Apply')?.disabled).toBe(false)
    buttonByText('Apply')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(mockMutate).toHaveBeenCalledTimes(2)
    expect(mockMutate.mock.calls[1][0].dryRun).toBe(false)
    expect(mockToastAdd.mock.calls.some(c => c[0].color === 'success')).toBe(true)
    expect(wrapper.emitted('update:open')?.some(e => e[0] === false)).toBe(true)
  })

  it('surfaces the all-or-nothing error report when apply returns errors', async () => {
    mockMutate
      .mockResolvedValueOnce(dryReport())
      .mockResolvedValueOnce({
        dry_run: false,
        applied: false,
        summary: { creates: 0, updates: 0, skips: 0, errors: 1 },
        rows: [{ row_number: 2, action: 'error', product_id: null, errors: ['conflict'] }],
      })
    await mountSuspended(ProductImportModal, { props: { open: true } })

    await setFile()
    buttonByText('Validate')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    buttonByText('Apply')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(document.body.textContent).toContain('conflict')
    expect(mockToastAdd.mock.calls.some(c => c[0].color === 'error')).toBe(true)
  })
})
