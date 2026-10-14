import type { Page } from '@playwright/test'

export type FocusStop = {
  role: string
  name: string
  testId: string | null
}

/** Describe the focused element for tab-order assertions (not a full a11y tree). */
async function activeFocusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) {
      return { role: 'body', name: '', testId: null }
    }
    const html = el as HTMLElement
    const testId = html.getAttribute('data-testid')
    let role = html.getAttribute('role') ?? html.tagName.toLowerCase()
    if (html.tagName === 'INPUT') {
      const type = (html as HTMLInputElement).type
      if (type === 'radio') role = 'radio'
      else if (type === 'checkbox') role = 'checkbox'
      else role = 'textbox'
    }
    if (html.tagName === 'BUTTON') role = 'button'
    if (html.tagName === 'A') role = 'link'
    if (html.tagName === 'SELECT') role = 'combobox'

    let name = html.getAttribute('aria-label')?.trim() ?? ''
    if (!name && html instanceof HTMLInputElement) {
      const labelled = html.labels?.[0]?.textContent?.trim()
      if (labelled) name = labelled
      else if (html.placeholder) name = html.placeholder
    }
    if (!name) {
      name = (html.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
    }
    return { role, name, testId }
  })
}

/**
 * Press Tab repeatedly from the current focus and collect focus stops.
 * Fails when the same stop repeats too often (likely a focus trap).
 */
export async function collectFocusTrail(
  page: Page,
  opts: { maxSteps?: number, repeatLimit?: number } = {},
): Promise<FocusStop[]> {
  const maxSteps = opts.maxSteps ?? 80
  const repeatLimit = opts.repeatLimit ?? 6
  const trail: FocusStop[] = []
  const repeatCount = new Map<string, number>()

  for (let i = 0; i < maxSteps; i++) {
    const stop = await activeFocusStop(page)
    trail.push(stop)
    const key = `${stop.role}|${stop.name}|${stop.testId ?? ''}`
    const next = (repeatCount.get(key) ?? 0) + 1
    repeatCount.set(key, next)
    if (next >= repeatLimit) {
      throw new Error(`Focus trap suspected at ${JSON.stringify(stop)} after ${i + 1} steps`)
    }
    await page.keyboard.press('Tab')
  }
  return trail
}

export function indexOfFocusStop(
  trail: FocusStop[],
  predicate: (stop: FocusStop, index: number) => boolean,
): number {
  return trail.findIndex(predicate)
}
