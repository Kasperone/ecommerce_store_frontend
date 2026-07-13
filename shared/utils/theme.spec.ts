import { describe, expect, it } from 'vitest'
import {
  RAMP_STEPS,
  brandThemeCss,
  contrastRatio,
  generatePrimaryRamp,
  isValidHexColor,
} from './theme'

describe('isValidHexColor', () => {
  it.each(['#1e40af', '#FFFFFF', '#000000', '#AbCdEf'])('accepts %s', (hex) => {
    expect(isValidHexColor(hex)).toBe(true)
  })

  it.each(['', 'red', '#fff', '#12345', '#1234567', '1e40af', '#12gh56'])(
    'rejects %s',
    (bad) => {
      expect(isValidHexColor(bad)).toBe(false)
    },
  )
})

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('is symmetric and 1 for identical colors', () => {
    expect(contrastRatio('#1e40af', '#1e40af')).toBeCloseTo(1, 5)
    expect(contrastRatio('#1e40af', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#1e40af'),
      5,
    )
  })
})

describe('generatePrimaryRamp', () => {
  it('returns null for invalid input', () => {
    expect(generatePrimaryRamp('nope')).toBeNull()
    expect(generatePrimaryRamp('')).toBeNull()
  })

  it('produces all 11 steps as valid hex colors', () => {
    const ramp = generatePrimaryRamp('#1e40af')!
    expect(Object.keys(ramp)).toHaveLength(RAMP_STEPS.length)
    for (const step of RAMP_STEPS) expect(ramp[step]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is monotonically darker from 50 to 950', () => {
    const ramp = generatePrimaryRamp('#e11d48')!
    const luminances = RAMP_STEPS.map(s => contrastRatio(ramp[s], '#ffffff'))
    for (let i = 1; i < luminances.length; i++) {
      // Contrast vs white strictly grows as the ramp darkens.
      expect(luminances[i]!).toBeGreaterThan(luminances[i - 1]!)
    }
  })

  // The invariant main.css relies on: --ui-primary = step 700 in light mode,
  // and it must carry white text at WCAG AA whatever hue the admin picks.
  it.each(['#1e40af', '#e11d48', '#f59e0b', '#facc15', '#22d3ee', '#84cc16', '#a21caf'])(
    'step 700 of %s passes 4.5:1 on white (AA guard)',
    (hex) => {
      const ramp = generatePrimaryRamp(hex)!
      expect(contrastRatio(ramp[700], '#ffffff')).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('keeps the picked hue family (spot check: blue input stays blue at 500)', () => {
    const ramp = generatePrimaryRamp('#1e40af')!
    const { 500: mid } = ramp
    // Blue channel dominates.
    const b = parseInt(mid!.slice(5, 7), 16)
    const r = parseInt(mid!.slice(1, 3), 16)
    expect(b).toBeGreaterThan(r)
  })
})

describe('brandThemeCss', () => {
  it('emits an unlayered :root block with all ramp vars', () => {
    const css = brandThemeCss('#1e40af')
    expect(css).toMatch(/^:root, :host \{/)
    for (const step of RAMP_STEPS) expect(css).toContain(`--ui-color-primary-${step}:`)
    expect(css).not.toContain('@layer')
  })

  it('returns empty string for invalid input', () => {
    expect(brandThemeCss('red')).toBe('')
    expect(brandThemeCss('')).toBe('')
  })
})
