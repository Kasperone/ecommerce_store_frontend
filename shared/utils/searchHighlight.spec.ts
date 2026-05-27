import { describe, expect, it } from 'vitest'
import { parseHighlightSegments } from './searchHighlight'

describe('parseHighlightSegments', () => {
  it('returns an empty array for empty/null input', () => {
    expect(parseHighlightSegments('')).toEqual([])
    expect(parseHighlightSegments(null)).toEqual([])
    expect(parseHighlightSegments(undefined)).toEqual([])
  })

  it('returns one unmarked segment for plain text', () => {
    expect(parseHighlightSegments('Blue Phone')).toEqual([{ text: 'Blue Phone', mark: false }])
  })

  it('marks a single highlighted span', () => {
    expect(parseHighlightSegments('<em>Pho</em>ne')).toEqual([
      { text: 'Pho', mark: true },
      { text: 'ne', mark: false },
    ])
  })

  it('handles leading text + multiple highlights', () => {
    expect(parseHighlightSegments('the <em>blue</em> <em>phone</em>')).toEqual([
      { text: 'the ', mark: false },
      { text: 'blue', mark: true },
      { text: ' ', mark: false },
      { text: 'phone', mark: true },
    ])
  })

  it('keeps embedded HTML as plain (unmarked) text — never as markup', () => {
    // The matched term is wrapped; the surrounding <script> stays literal text,
    // so the renderer escapes it (no XSS).
    const segments = parseHighlightSegments('<script>al<em>ert</em>(1)</script>')
    expect(segments).toEqual([
      { text: '<script>al', mark: false },
      { text: 'ert', mark: true },
      { text: '(1)</script>', mark: false },
    ])
  })

  it('treats an unbalanced opening tag defensively as plain text', () => {
    expect(parseHighlightSegments('abc<em>def')).toEqual([
      { text: 'abc', mark: false },
      { text: 'def', mark: false },
    ])
  })
})
