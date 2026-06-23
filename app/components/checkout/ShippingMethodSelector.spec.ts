// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { axe } from 'vitest-axe'
import ShippingMethodSelector from './ShippingMethodSelector.vue'

/**
 * Renders the selector against a stubbed `useShippingQuote`. The composable
 * itself is exercised in `useShippingQuote.spec.ts` — here we pin the UI
 * contract: empty-state, no-country state, list rendering, free-above hint,
 * the cheapest auto-selection, and the dual `update:modelValue` +
 * `update:methodAmount` emits.
 *
 * The selector internally `watch`-es the `methods` source, so the mock has to
 * return real Vue refs (not plain `{ value }` objects — `watch` over those
 * crashes). `vi.hoisted` cannot reference `ref` because its import is hoisted
 * below the factory; instead the refs are declared at module scope and the
 * mockNuxtImport factory (which runs lazily, after imports) closes over them.
 */

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const methodsRef = ref<unknown[]>([])
const loadingRef = ref(false)
const failedRef = ref(false)

mockNuxtImport('useShippingQuote', () => () => ({
  methods: methodsRef,
  loading: loadingRef,
  failed: failedRef,
  clear: vi.fn(),
}))

beforeEach(() => {
  methodsRef.value = []
  loadingRef.value = false
  failedRef.value = false
})

afterEach(() => {
  vi.clearAllMocks()
})

const sampleMethods = [
  {
    id: 1,
    name: 'Standard',
    code: 'standard',
    description: 'Standard delivery',
    sort_order: 10,
    amount: 19.99,
    currency: 'PLN',
    is_free: false,
    pricing_kind: 'free_above',
    free_above_subtotal: 200,
  },
  {
    id: 2,
    name: 'Express',
    code: 'express',
    description: null,
    sort_order: 20,
    amount: 49.99,
    currency: 'PLN',
    is_free: false,
    pricing_kind: 'flat',
    free_above_subtotal: null,
  },
]

const defaultProps = {
  country: 'PL',
  currency: 'PLN' as const,
  subtotal: 50,
  modelValue: null,
}

describe('CheckoutShippingMethodSelector', () => {
  it('prompts to pick a country when none is set', async () => {
    const wrapper = await mountSuspended(ShippingMethodSelector, {
      props: { ...defaultProps, country: '' },
    })
    expect(wrapper.text()).toContain('Select a country')
  })

  it('shows the empty-methods notice with the localized country name', async () => {
    methodsRef.value = []
    const wrapper = await mountSuspended(ShippingMethodSelector, {
      props: { ...defaultProps, country: 'PL' },
    })
    // "We don't ship to Poland yet." — Polish name resolved from the country util.
    expect(wrapper.text()).toContain('Poland')
  })

  it('renders the list and auto-selects the cheapest method', async () => {
    methodsRef.value = sampleMethods
    const wrapper = await mountSuspended(ShippingMethodSelector, {
      props: { ...defaultProps },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Standard')
    expect(wrapper.text()).toContain('Express')

    // Cheapest is Standard (19.99 < 49.99) — defaults to selected; the v-model
    // emit fires once for the initial selection.
    const emits = wrapper.emitted('update:modelValue')
    expect(emits).toBeTruthy()
    expect(emits!.at(-1)).toEqual([1])
  })

  it('emits update:methodAmount alongside the id', async () => {
    methodsRef.value = sampleMethods
    const wrapper = await mountSuspended(ShippingMethodSelector, {
      props: { ...defaultProps },
    })
    await wrapper.vm.$nextTick()

    const amounts = wrapper.emitted('update:methodAmount')
    expect(amounts).toBeTruthy()
    // Last emit corresponds to the auto-selected Standard's resolved amount.
    expect(amounts!.at(-1)).toEqual([19.99])
  })

  it('shows the remaining-to-free-shipping nudge when below the threshold', async () => {
    methodsRef.value = sampleMethods
    const wrapper = await mountSuspended(ShippingMethodSelector, {
      props: { ...defaultProps },
    })
    // PL conversion nudge: how much MORE for free shipping (not the bare
    // threshold). PL locale says "Do darmowej dostawy brakuje …"; EN asserted here.
    expect(wrapper.text()).toMatch(/more for free shipping/)
  })

  it('shows the "Free" label when a method resolved to zero', async () => {
    methodsRef.value = [
      { ...sampleMethods[0], amount: 0, is_free: true },
    ]
    const wrapper = await mountSuspended(ShippingMethodSelector, {
      props: { ...defaultProps },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Free')
  })

  it('surfaces an inline alert on a quote error', async () => {
    failedRef.value = true
    const wrapper = await mountSuspended(ShippingMethodSelector, {
      props: { ...defaultProps },
    })
    expect(wrapper.text()).toMatch(/couldn't load shipping/i)
  })

  it('has no axe violations in the populated state', async () => {
    methodsRef.value = sampleMethods
    const wrapper = await mountSuspended(ShippingMethodSelector, {
      props: { ...defaultProps },
    })
    await wrapper.vm.$nextTick()
    const results = await axe(wrapper.element, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
