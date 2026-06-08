// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import CampaignFormModal from './CampaignFormModal.vue'

/**
 * The modal owns the create/update mutations + the success toast and the
 * client-side validation that mirrors the backend rule (`scheduled_at` required
 * when `status === 'scheduled'`). We stub the auto-imported mutations/toast and
 * assert: create-vs-edit title + prefill, the create/update payloads, each
 * validation guard (name/subject required, scheduled-needs-date), error
 * rendering, and a11y. URL/verb mapping is pinned in the query spec.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
  },
}

const { createMutate, updateMutate, toastAdd, previewSaved, segmentsData } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  toastAdd: vi.fn(),
  previewSaved: vi.fn(),
  segmentsData: { value: { items: [], total: 0 } as unknown },
}))

mockNuxtImport('useCreateCampaign', () => () => ({
  mutateAsync: createMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useUpdateCampaign', () => () => ({
  mutateAsync: updateMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))
mockNuxtImport('useSegmentsQuery', () => () => ({ data: ref(segmentsData.value) }))
mockNuxtImport('useSegmentPreview', () => () => ({ previewSaved }))

beforeEach(() => {
  createMutate.mockReset().mockResolvedValue({})
  updateMutate.mockReset().mockResolvedValue({})
  toastAdd.mockReset()
  previewSaved.mockReset().mockResolvedValue({ count: 42, sample: [] })
  segmentsData.value = {
    items: [
      { id: 11, name: 'VIP buyers', is_active: true },
      { id: 12, name: 'Lapsed', is_active: true },
    ],
    total: 2,
  }
  document.body.innerHTML = ''
})

function clickSave() {
  const saveBtn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Save',
  ) as HTMLButtonElement | undefined
  saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const tick = () => new Promise(r => setTimeout(r, 0))

const existing = {
  id: 7,
  name: 'Winter blast',
  subject: 'Winter is here',
  audience: 'b2b' as const,
  status: 'draft' as const,
  body: 'Hello',
  scheduled_at: null,
  sent_at: null,
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

describe('CampaignFormModal', () => {
  it('shows the create title when no campaign is passed', async () => {
    await mountSuspended(CampaignFormModal, { props: { open: true, campaign: null } })
    expect(document.body.textContent).toContain('New campaign')
  })

  it('prefills and shows the edit title when a campaign is passed', async () => {
    await mountSuspended(CampaignFormModal, { props: { open: true, campaign: existing } })
    expect(document.body.textContent).toContain('Edit campaign')
    const values = [...document.querySelectorAll('input')].map(i => i.value)
    expect(values).toContain('Winter blast')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CampaignFormModal, { props: { open: true, campaign: null } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('creates a draft campaign on save (body trimmed to null when empty)', async () => {
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: null },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    // [0] = name, [1] = subject (scheduled_at hidden while status=draft).
    inputs[0]!.vm.$emit('update:modelValue', 'Spring sale')
    inputs[1]!.vm.$emit('update:modelValue', 'Big discounts')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0]![0]
    expect(body).toMatchObject({
      name: 'Spring sale',
      subject: 'Big discounts',
      audience: 'all',
      status: 'draft',
      body: null,
      scheduled_at: null,
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('rejects an empty name without calling the mutation', async () => {
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: null },
    })
    // name left blank; fill only subject.
    wrapper.findAllComponents({ name: 'UInput' })[1]!.vm.$emit('update:modelValue', 'Subject only')
    await tick()

    clickSave()
    await tick()

    // Client-side Zod validation blocks submit and renders the field error.
    expect(createMutate).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Name is required.')
  })

  it('requires a scheduled date when status is scheduled', async () => {
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Scheduled one')
    wrapper.findAllComponents({ name: 'UInput' })[1]!.vm.$emit('update:modelValue', 'Coming soon')
    // USelect[1] = status -> scheduled, leaving scheduled_at empty.
    wrapper.findAllComponents({ name: 'USelect' })[1]!.vm.$emit('update:modelValue', 'scheduled')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('A scheduled date is required')
  })

  it('creates a scheduled campaign once a date is supplied', async () => {
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Scheduled one')
    wrapper.findAllComponents({ name: 'UInput' })[1]!.vm.$emit('update:modelValue', 'Coming soon')
    wrapper.findAllComponents({ name: 'USelect' })[1]!.vm.$emit('update:modelValue', 'scheduled')
    await tick()
    // The scheduled_at input renders once status=scheduled — it's now UInput[2].
    wrapper.findAllComponents({ name: 'UInput' })[2]!.vm.$emit('update:modelValue', '2026-07-01T09:00')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0]![0]
    expect(body.status).toBe('scheduled')
    expect(body.scheduled_at).toBeTruthy()
  })

  it('updates an existing campaign on save (PATCH payload)', async () => {
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: existing },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Winter blast v2')
    await tick()

    clickSave()
    await tick()

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const { id, patch } = updateMutate.mock.calls[0]![0]
    expect(id).toBe(7)
    expect(patch).toMatchObject({ name: 'Winter blast v2', audience: 'b2b', status: 'draft' })
  })

  it('shows the inline error alert + an error toast when the mutation fails (server 422)', async () => {
    createMutate.mockRejectedValue({ data: { detail: 'scheduled_at is required' } })
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Bad')
    wrapper.findAllComponents({ name: 'UInput' })[1]!.vm.$emit('update:modelValue', 'Subject')
    await tick()

    clickSave()
    await tick()

    // Gold-standard flow: server detail surfaces inline (role=alert) + as a toast.
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('scheduled_at is required')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })

  it('requires a segment when the audience is segment', async () => {
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Segment blast')
    wrapper.findAllComponents({ name: 'UInput' })[1]!.vm.$emit('update:modelValue', 'For VIPs')
    // USelect[0] = audience -> segment, leaving segment_id unset.
    wrapper.findAllComponents({ name: 'USelect' })[0]!.vm.$emit('update:modelValue', 'segment')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('A segment is required')
  })

  it('sends segment_id when a segment audience + segment are chosen', async () => {
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Segment blast')
    wrapper.findAllComponents({ name: 'UInput' })[1]!.vm.$emit('update:modelValue', 'For VIPs')
    wrapper.findAllComponents({ name: 'USelect' })[0]!.vm.$emit('update:modelValue', 'segment')
    await tick()
    // Once segment audience is active the segment picker renders as USelect[2]
    // (audience, status, then segment).
    wrapper.findAllComponents({ name: 'USelect' })[2]!.vm.$emit('update:modelValue', 11)
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0]![0]
    expect(body.audience).toBe('segment')
    expect(body.segment_id).toBe(11)
  })

  it('does not send a segment_id for a non-segment audience', async () => {
    const wrapper = await mountSuspended(CampaignFormModal, {
      props: { open: true, campaign: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Everyone blast')
    wrapper.findAllComponents({ name: 'UInput' })[1]!.vm.$emit('update:modelValue', 'Hello all')
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0]![0].segment_id).toBeNull()
  })
})
