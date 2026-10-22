// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import DownloadButton from './DownloadButton.vue'

const { mockDownload, mockToastAdd } = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useDownloadQuote', () => () => ({
  download: mockDownload,
  isDownloading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('AccountQuotesDownloadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownload.mockResolvedValue(null)
  })

  it('renders the download label', async () => {
    const wrapper = await mountSuspended(DownloadButton, { props: { quoteId: 5 } })
    expect(wrapper.text()).toContain('Download PDF')
  })

  it('downloads with the quote id + active locale on click', async () => {
    const wrapper = await mountSuspended(DownloadButton, { props: { quoteId: 5 } })
    await wrapper.find('button').trigger('click')
    await flush()
    expect(mockDownload).toHaveBeenCalledWith(5, 'en')
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('toasts an error when the download fails', async () => {
    mockDownload.mockResolvedValue({ title: 'Boom', detail: 'Quote not found' })
    const wrapper = await mountSuspended(DownloadButton, { props: { quoteId: 5 } })
    await wrapper.find('button').trigger('click')
    await flush()
    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0]![0].color).toBe('error')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(DownloadButton, { props: { quoteId: 5 } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
