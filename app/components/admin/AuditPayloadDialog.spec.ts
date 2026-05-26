// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { AuditEventItem } from '#shared/types/api'
import AuditPayloadDialog from './AuditPayloadDialog.vue'

/**
 * `aria-hidden-focus` is disabled in axe runs for the reka-ui open-transition
 * timing reason documented in AdminFormModal.spec.ts.
 */
const AXE_OPTIONS = { rules: { 'aria-hidden-focus': { enabled: false } } }

function ev(payload: Record<string, unknown>, overrides: Partial<AuditEventItem> = {}): AuditEventItem {
  return {
    id: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    actor_id: 7,
    actor_email: 'admin@example.com',
    action: 'update',
    resource_type: 'product',
    resource_id: 3,
    payload,
    ip: '127.0.0.1',
    user_agent: 'x',
    ...overrides,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AuditPayloadDialog', () => {
  it('renders both before and after columns for an update', async () => {
    await mountSuspended(AuditPayloadDialog, {
      props: { open: true, event: ev({ before: { name: 'Old' }, after: { name: 'New' } }) },
    })
    const text = document.body.textContent ?? ''
    expect(text).toContain('Before')
    expect(text).toContain('After')
    expect(text).toContain('Old')
    expect(text).toContain('New')
    expect(text).toContain('admin@example.com')
  })

  it('shows only the after side for a create', async () => {
    await mountSuspended(AuditPayloadDialog, {
      props: { open: true, event: ev({ after: { name: 'Created' } }, { action: 'create' }) },
    })
    const text = document.body.textContent ?? ''
    expect(text).toContain('After')
    expect(text).toContain('Created')
    expect(text).not.toContain('Before')
  })

  it('shows the empty note when the payload has no before/after', async () => {
    await mountSuspended(AuditPayloadDialog, {
      props: { open: true, event: ev({}) },
    })
    expect(document.body.textContent).toContain('No field-level changes')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(AuditPayloadDialog, {
      props: { open: true, event: ev({ before: { name: 'Old' }, after: { name: 'New' } }) },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
