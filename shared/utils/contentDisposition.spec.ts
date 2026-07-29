import { describe, expect, it } from 'vitest'
import { filenameFromDisposition } from './contentDisposition'

/**
 * Six download composables now share this parser, so its edge cases are worth
 * pinning once here rather than four times over in the callers' specs.
 */
describe('filenameFromDisposition', () => {
  it('reads a quoted filename', () => {
    expect(filenameFromDisposition('attachment; filename="orders-paid.csv"'))
      .toBe('orders-paid.csv')
  })

  it('reads an unquoted filename', () => {
    expect(filenameFromDisposition('attachment; filename=products.csv'))
      .toBe('products.csv')
  })

  it('is case-insensitive about the parameter name', () => {
    expect(filenameFromDisposition('attachment; FileName="a.pdf"')).toBe('a.pdf')
  })

  it('keeps the dashes a sanitised faktura number carries', () => {
    // The backend replaces `/` in the invoice series before it reaches the wire.
    expect(filenameFromDisposition('attachment; filename="invoice-2026-07-0042.pdf"'))
      .toBe('invoice-2026-07-0042.pdf')
  })

  it('stops at the parameter separator', () => {
    expect(filenameFromDisposition('attachment; filename="a.csv"; size=12'))
      .toBe('a.csv')
  })

  // A null return is the caller's signal to keep its own fallback name — which
  // is what every response looked like before the API exposed the header to CORS.
  it('returns null for a missing header', () => {
    expect(filenameFromDisposition(null)).toBeNull()
  })

  it('returns null when the header carries no filename', () => {
    expect(filenameFromDisposition('attachment')).toBeNull()
  })
})
