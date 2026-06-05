// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ImagePlaceholder from './ImagePlaceholder.vue'

describe('CmsImagePlaceholder', () => {
  it('renders the default caption and an image role', async () => {
    const w = await mountSuspended(ImagePlaceholder)
    expect(w.find('[role="img"]').exists()).toBe(true)
    expect(w.text()).toContain('Image') // default en label
  })

  it('overrides the caption with the label prop', async () => {
    const w = await mountSuspended(ImagePlaceholder, { props: { label: 'Hero photo' } })
    expect(w.text()).toContain('Hero photo')
  })

  it('hides the caption when label is empty but keeps an aria-label', async () => {
    const w = await mountSuspended(ImagePlaceholder, { props: { label: '' } })
    expect(w.find('span.font-medium').exists()).toBe(false) // caption span
    expect(w.text()).not.toContain('Image')
    expect(w.get('[role="img"]').attributes('aria-label')).toBeTruthy()
  })
})
