// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The settings hub landing renders its heading + the shared nav. Sub-route
 * page bodies are owned by sibling tasks and may 404 until they land — the hub
 * only needs to surface the nav.
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

  it('renders the settings nav with the five sub-route links', async () => {
    const wrapper = await mountPage()
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/settings/profile')
    expect(hrefs).toContain('/account/settings/security')
    expect(hrefs).toContain('/account/settings/addresses')
    expect(hrefs).toContain('/account/settings/preferences')
    expect(hrefs).toContain('/account/settings/privacy')
  })

  it('declares the \'user\' middleware', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/settings/index.vue'), 'utf-8')
    expect(src).toMatch(/middleware:\s*'user'/)
  })
})
