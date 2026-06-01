import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safeRedirect'

const FALLBACK = '/'

describe('safeRedirect — rejected shapes return fallback', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['empty array', []],
    ['array of strings', ['/a', '/b']],
    ['plain object', {}],
    ['boolean', true],
  ])('non-string (%s) → fallback', (_label, input) => {
    expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
  })

  it('empty string → fallback', () => {
    expect(safeRedirect('', FALLBACK)).toBe(FALLBACK)
  })

  it.each(['orders/42', 'foo', 'admin'])(
    'bare path without leading slash (%s) → fallback',
    (input) => {
      expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
    },
  )

  it.each(['//evil.example', '///still-evil', '//evil.example/path'])(
    'protocol-relative URL (%s) → fallback',
    (input) => {
      expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
    },
  )

  it.each(['https://evil.example', 'http://x', 'ftp://x', 'https://evil.example/path?q=1'])(
    'absolute URL (%s) → fallback',
    (input) => {
      expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
    },
  )

  it.each(['javascript:alert(1)', 'data:text/html,x', 'mailto:x@y.z'])(
    'scheme without leading slash (%s) → fallback',
    (input) => {
      expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
    },
  )

  it.each(['/foo://bar', '/redirect?next=https://evil.example'])(
    'path with leading slash but embedded :// (%s) → fallback',
    (input) => {
      expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
    },
  )

  it.each(['/\\evil.example', '/\\/evil.example', '\\\\evil.example'])(
    'backslash that browsers normalize to // (%s) → fallback',
    (input) => {
      expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
    },
  )

  it.each([
    ['percent-encoded backslash', '/%5Cevil.example'],
    ['percent-encoded tab', '/%09/evil.example'],
  ])('percent-encoded bypass (%s) → fallback', (_label, input) => {
    expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
  })

  it.each([
    ['literal tab in scheme', '/foo\tbar'],
    ['literal newline', '/foo\nbar'],
    ['literal CR', '/foo\rbar'],
    ['tab-split javascript scheme', 'java\tscript:alert(1)'],
  ])('control character (%s) → fallback', (_label, input) => {
    expect(safeRedirect(input, FALLBACK)).toBe(FALLBACK)
  })

  it('malformed percent-encoding → fallback', () => {
    expect(safeRedirect('/%E0%A4%A', FALLBACK)).toBe(FALLBACK)
  })
})

describe('safeRedirect — accepted shapes return target verbatim', () => {
  it.each([
    '/',
    '/orders/42',
    '/admin/users/42/edit',
    '/products?id=5&sort=asc',
    '/page#section',
  ])('same-origin path (%s) → returned unchanged', (input) => {
    expect(safeRedirect(input, FALLBACK)).toBe(input)
  })
})

describe('safeRedirect — fallback is returned verbatim', () => {
  it('passes the caller-supplied fallback through without validating it', () => {
    expect(safeRedirect('://bad', '/admin')).toBe('/admin')
  })
})
