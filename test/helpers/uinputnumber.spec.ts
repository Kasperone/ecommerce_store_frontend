/**
 * Unit-style coverage for the UInputNumber Playwright helpers. The Locator is
 * stubbed because we're testing the sequence of operations (click + key
 * presses), not real browser behavior — the real-browser proof is that the
 * sequence works when called from an actual spec.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Locator } from '@playwright/test'
import { clearUInputNumber, setUInputNumber } from '../../e2e/helpers/uinputnumber'

function makeLocatorStub() {
  return {
    calls: [] as string[],
    locator: {
      click: vi.fn(function (this: any) {
        this.calls.push('click')
        return Promise.resolve()
      }),
      press: vi.fn(function (this: any, key: string) {
        this.calls.push(`press:${key}`)
        return Promise.resolve()
      }),
      pressSequentially: vi.fn(function (this: any, text: string) {
        this.calls.push(`type:${text}`)
        return Promise.resolve()
      }),
    },
  }
}

describe('clearUInputNumber', () => {
  it('dispatches focus → Ctrl+A → Delete → Tab', async () => {
    const stub = makeLocatorStub()
    // Bind `this` of each method to the stub so they record into stub.calls.
    const locator = {
      click: stub.locator.click.bind(stub),
      press: stub.locator.press.bind(stub),
      pressSequentially: stub.locator.pressSequentially.bind(stub),
    } as unknown as Locator

    await clearUInputNumber(locator)

    expect(stub.calls).toEqual([
      'click',
      'press:ControlOrMeta+a',
      'press:Delete',
      'press:Tab',
    ])
  })
})

describe('setUInputNumber', () => {
  it('clears, refocuses, types the value, then blurs via Tab', async () => {
    const stub = makeLocatorStub()
    const locator = {
      click: stub.locator.click.bind(stub),
      press: stub.locator.press.bind(stub),
      pressSequentially: stub.locator.pressSequentially.bind(stub),
    } as unknown as Locator

    await setUInputNumber(locator, 42.5)

    expect(stub.calls).toEqual([
      'click',
      'press:ControlOrMeta+a',
      'press:Delete',
      'press:Tab',
      'click',
      'type:42.5',
      'press:Tab',
    ])
  })

  it('accepts a string value (preserves caller-controlled formatting)', async () => {
    const stub = makeLocatorStub()
    const locator = {
      click: stub.locator.click.bind(stub),
      press: stub.locator.press.bind(stub),
      pressSequentially: stub.locator.pressSequentially.bind(stub),
    } as unknown as Locator

    await setUInputNumber(locator, '1,234.56')

    expect(stub.calls).toContain('type:1,234.56')
  })
})
