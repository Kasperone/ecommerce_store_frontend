// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import InvoiceDownloadButton from './InvoiceDownloadButton.vue'

const { mockDownload, mockToastAdd } = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useDownloadInvoice', () => () => ({
  download: mockDownload,
  isDownloading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('OrdersInvoiceDownloadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownload.mockResolvedValue(null)
  })

  it('renders the download label', async () => {
    const wrapper = await mountSuspended(InvoiceDownloadButton, {
      props: { orderId: 7, orderNumber: 'ORD-X' },
    })
    expect(wrapper.text()).toContain('Download invoice')
  })

  it('downloads with the order + active locale on click', async () => {
    const wrapper = await mountSuspended(InvoiceDownloadButton, {
      props: { orderId: 7, orderNumber: 'ORD-20260527-ABC' },
    })
    await wrapper.find('button').trigger('click')
    await flush()
    expect(mockDownload).toHaveBeenCalledWith(7, 'ORD-20260527-ABC', 'en')
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('toasts an error when the download fails', async () => {
    mockDownload.mockResolvedValue({ title: 'Boom', detail: 'Order not found' })
    const wrapper = await mountSuspended(InvoiceDownloadButton, {
      props: { orderId: 7, orderNumber: 'ORD-X' },
    })
    await wrapper.find('button').trigger('click')
    await flush()
    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0]![0].color).toBe('error')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(InvoiceDownloadButton, {
      props: { orderId: 7, orderNumber: 'ORD-X' },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
