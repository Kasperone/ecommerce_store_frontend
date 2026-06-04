// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The settings hub landing renders its heading. The navigation moved to the
 * persistent account rail (layouts/account.vue) in the redesign Phase 1, so the
 * hub no longer renders an in-body nav of its own.
 */
const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

describe('account/settings hub page', () => {
  it('renders the settings title', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Account settings')
  })

  it('uses the persistent account layout', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/settings/index.vue'), 'utf-8')
    expect(src).toMatch(/layout:\s*'account'/)
  })

  it('declares the \'user\' middleware', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/settings/index.vue'), 'utf-8')
    expect(src).toMatch(/middleware:\s*'user'/)
  })
})
