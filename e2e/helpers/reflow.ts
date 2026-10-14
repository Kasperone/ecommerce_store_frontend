import { expect, type Page } from '@playwright/test'

/** Subpixel rounding and scrollbar quirks — WCAG reflow checks need a small slack. */
const DEFAULT_SLACK_PX = 2

export type HorizontalOverflowMetrics = {
  scrollWidth: number
  clientWidth: number
}

export async function getHorizontalOverflow(page: Page): Promise<HorizontalOverflowMetrics> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

/** WCAG 1.4.10 — no two-dimensional scrolling at narrow viewports. */
export async function assertNoHorizontalOverflow(
  page: Page,
  slackPx = DEFAULT_SLACK_PX,
): Promise<void> {
  const { scrollWidth, clientWidth } = await getHorizontalOverflow(page)
  expect(
    scrollWidth,
    `horizontal overflow: scrollWidth=${scrollWidth} > clientWidth=${clientWidth} (+${slackPx}px slack)`,
  ).toBeLessThanOrEqual(clientWidth + slackPx)
}
