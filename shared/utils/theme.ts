/**
 * Runtime brand theming (brand program B4+C).
 *
 * The admin picks a single `store_config.primary_color` hex; we generate the
 * full Nuxt UI `--ui-color-primary-50…950` ramp from it at render time. The
 * ramp keeps the picked color's hue/saturation and walks a fixed,
 * Tailwind-like lightness scale, so hover/soft/step-based component variants
 * keep working exactly as with a built-in palette.
 *
 * WCAG guard: `main.css` maps `--ui-primary` to step **700** in light mode
 * precisely because the default green-500 failed AA on white. We preserve
 * that invariant computationally: step 700 is darkened until it reaches
 * >= 4.5:1 contrast on white, whatever hue the admin picks (pale yellows
 * included), and 800/900/950 are re-clamped below it so the ramp stays
 * monotonic. Dark mode uses step 400 (unchanged mapping).
 */

export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type RampStep = (typeof RAMP_STEPS)[number]

/** Tailwind-like lightness (HSL L, 0..1) per ramp step. */
const STEP_LIGHTNESS: Record<RampStep, number> = {
  50: 0.97,
  100: 0.93,
  200: 0.86,
  300: 0.77,
  400: 0.65,
  500: 0.51,
  600: 0.42,
  700: 0.34,
  800: 0.27,
  900: 0.22,
  950: 0.13,
}

const WHITE_CONTRAST_TARGET = 4.5
/** Minimum lightness gap kept between adjacent dark steps after the AA pass. */
const DARK_STEP_GAP = 0.04

const HEX_RE = /^#[0-9a-f]{6}$/i

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

interface Rgb { r: number, g: number, b: number }
interface Hsl { h: number, s: number, l: number }

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h, s, l }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return {
    r: hue(h + 1 / 3) * 255,
    g: hue(h) * 255,
    b: hue(h - 1 / 3) * 255,
  }
}

/** WCAG 2.x relative luminance. */
function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const cn = c / 255
    return cn <= 0.04045 ? cn / 12.92 : ((cn + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgb(hexA))
  const lb = relativeLuminance(hexToRgb(hexB))
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function stepHex(base: Hsl, lightness: number): string {
  return rgbToHex(hslToRgb({ h: base.h, s: base.s, l: lightness }))
}

/**
 * Generate the 11-step primary ramp from a `#rrggbb` brand color.
 * Returns `null` for invalid input (caller renders the default theme).
 */
export function generatePrimaryRamp(hex: string): Record<RampStep, string> | null {
  if (!isValidHexColor(hex)) return null
  const base = rgbToHsl(hexToRgb(hex))
  const lightness: Record<RampStep, number> = { ...STEP_LIGHTNESS }

  // AA guard: darken step 700 until white text passes 4.5:1 on it.
  let l700 = lightness[700]
  while (l700 > 0 && contrastRatio(stepHex(base, l700), '#ffffff') < WHITE_CONTRAST_TARGET) {
    l700 -= 0.01
  }
  lightness[700] = l700
  // Keep the darker steps monotonically below the adjusted 700.
  lightness[800] = Math.min(lightness[800], l700 - DARK_STEP_GAP)
  lightness[900] = Math.min(lightness[900], lightness[800] - DARK_STEP_GAP)
  lightness[950] = Math.max(0.02, Math.min(lightness[950], lightness[900] - DARK_STEP_GAP))
  // …and 600 above it stays above 700 (it may not, if 700 barely moved — clamp).
  lightness[600] = Math.max(lightness[600], l700 + 0.01)

  const ramp = {} as Record<RampStep, string>
  for (const step of RAMP_STEPS) ramp[step] = stepHex(base, lightness[step])
  return ramp
}

/**
 * The inline CSS injected into `<head>` when a brand color is configured.
 * Unlayered on purpose: it must beat Nuxt UI's `@layer theme` definitions,
 * mirroring the unlayered overrides in `app/assets/css/main.css`. The
 * existing `--ui-primary` step mappings there (700 light / 400 dark) then
 * consume this ramp unchanged.
 */
export function brandThemeCss(hex: string): string {
  const ramp = generatePrimaryRamp(hex)
  if (!ramp) return ''
  const vars = RAMP_STEPS.map(step => `--ui-color-primary-${step}: ${ramp[step]};`).join(' ')
  return `:root, :host { ${vars} }`
}
