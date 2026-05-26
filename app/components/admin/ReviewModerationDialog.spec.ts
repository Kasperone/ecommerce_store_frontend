// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import ReviewModerationDialog from './ReviewModerationDialog.vue'

/**
 * The dialog owns the moderate (approve/reject) + delete mutations and the
 * success toast, so we stub those auto-imports and assert the dialog's own
 * logic: status-conditional action buttons, the two-step delete confirm,
 * the error-on-failure branch, and a11y. Argument mapping for the mutations is
 * pinned in `useReviewQueries.spec.ts`.
 *
 * `aria-hidden-focus` is disabled in axe runs for the same reka-ui
 * open-transition timing reason documented in InventoryAdjustDialog.spec.ts.
 */

const AXE_OPTIONS = { rules: { 'aria-hidden-focus': { enabled: false } } }

const { moderateMutate, deleteMutate, toastAdd } = vi.hoisted(() => ({
  moderateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useModerateReview', () => () => ({
  mutateAsync: moderateMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useDeleteReview', () => () => ({
  mutateAsync: deleteMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  moderateMutate.mockReset().mockResolvedValue({})
  deleteMutate.mockReset().mockResolvedValue(undefined)
  toastAdd.mockReset()
  document.body.innerHTML = ''
})

function baseReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    created_at: '2026-05-27T10:00:00Z',
    updated_at: '2026-05-27T10:00:00Z',
    product_id: 1,
    product_name: 'Test Phone',
    product_slug: 'test-phone',
    user_id: 2,
    author_name: 'Ann S.',
    author_email: 'ann@example.com',
    rating: 4,
    title: 'Great phone',
    body: 'Battery lasts all day and the screen is gorgeous.',
    status: 'pending',
    is_verified_purchase: true,
    ...overrides,
  }
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined
}

function click(text: string) {
  button(text)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('ReviewModerationDialog', () => {
  it('renders the review body, title, author and product', async () => {
    await mountSuspended(ReviewModerationDialog, {
      props: { open: true, review: baseReview() },
    })
    const text = document.body.textContent ?? ''
    expect(text).toContain('Great phone')
    expect(text).toContain('Battery lasts all day')
    expect(text).toContain('ann@example.com')
    expect(text).toContain('Test Phone')
  })

  it('approves the review and emits close', async () => {
    const wrapper = await mountSuspended(ReviewModerationDialog, {
      props: { open: true, review: baseReview() },
    })
    click('Approve')
    await new Promise(r => setTimeout(r, 0))

    expect(moderateMutate).toHaveBeenCalledWith({ id: 7, status: 'approved' })
    expect(toastAdd).toHaveBeenCalled()
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('rejects the review', async () => {
    await mountSuspended(ReviewModerationDialog, {
      props: { open: true, review: baseReview() },
    })
    click('Reject')
    await new Promise(r => setTimeout(r, 0))
    expect(moderateMutate).toHaveBeenCalledWith({ id: 7, status: 'rejected' })
  })

  it('hides the Approve button for an already-approved review', async () => {
    await mountSuspended(ReviewModerationDialog, {
      props: { open: true, review: baseReview({ status: 'approved' }) },
    })
    expect(button('Approve')).toBeUndefined()
    expect(button('Reject')).toBeTruthy()
  })

  it('requires a second click to delete (confirm step)', async () => {
    await mountSuspended(ReviewModerationDialog, {
      props: { open: true, review: baseReview() },
    })
    click('Delete')
    await new Promise(r => setTimeout(r, 0))
    expect(deleteMutate).not.toHaveBeenCalled()

    click('Confirm delete')
    await new Promise(r => setTimeout(r, 0))
    expect(deleteMutate).toHaveBeenCalledWith(7)
    expect(toastAdd).toHaveBeenCalled()
  })

  it('shows an error alert and no toast when moderation fails', async () => {
    moderateMutate.mockRejectedValue({ data: { detail: 'Boom' } })
    await mountSuspended(ReviewModerationDialog, {
      props: { open: true, review: baseReview() },
    })
    click('Approve')
    await new Promise(r => setTimeout(r, 0))

    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(ReviewModerationDialog, {
      props: { open: true, review: baseReview() },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
