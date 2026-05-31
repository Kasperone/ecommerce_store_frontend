// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ReportFilters from './ReportFilters.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('ReportFilters', () => {
  it('emits update:start when the from date changes', async () => {
    const wrapper = await mountSuspended(ReportFilters, {
      props: { start: '2026-05-01', end: '2026-05-31', granularity: 'day' },
    })
    const fromInput = wrapper.find('input[type="date"]')
    await fromInput.setValue('2026-05-10')
    expect(wrapper.emitted('update:start')?.[0]).toEqual(['2026-05-10'])
  })

  it('emits undefined when a date is cleared', async () => {
    const wrapper = await mountSuspended(ReportFilters, {
      props: { start: '2026-05-01', end: '2026-05-31', granularity: 'day' },
    })
    const fromInput = wrapper.find('input[type="date"]')
    await fromInput.setValue('')
    expect(wrapper.emitted('update:start')?.[0]).toEqual([undefined])
  })

  it('emits update:granularity when the select changes', async () => {
    // Nuxt UI's USelect renders a button[role=combobox] + teleported listbox, not
    // a native <select> — drive the emit via the component (the CatalogToolbar
    // spec uses the same `findComponent(...).vm.$emit('update:modelValue', …)`).
    const wrapper = await mountSuspended(ReportFilters, {
      props: { start: '2026-05-01', end: '2026-05-31', granularity: 'day' },
    })
    wrapper.findComponent({ name: 'USelect' }).vm.$emit('update:modelValue', 'month')
    expect(wrapper.emitted('update:granularity')?.[0]).toEqual(['month'])
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(ReportFilters, {
      props: { start: '2026-05-01', end: '2026-05-31', granularity: 'day' },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
