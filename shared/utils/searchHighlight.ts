/**
 * Parse a Meilisearch `_formatted` highlight string into safe render segments.
 *
 * The backend wraps matched terms in `<em>…</em>`. We must **never** `v-html`
 * this string: the underlying text is admin-entered product content and could
 * contain `<script>` etc. Instead we split on the exact highlight delimiters and
 * render each segment as a Vue text node (auto-escaped), wrapping only the
 * matched segments in a real `<em>`. So any HTML in the source renders as inert
 * text — the only live markup is the emphasis tag we control.
 */

export interface HighlightSegment {
  text: string
  mark: boolean
}

const PRE = '<em>'
const POST = '</em>'

export function parseHighlightSegments(raw: string | null | undefined): HighlightSegment[] {
  if (!raw) return []
  const segments: HighlightSegment[] = []
  let rest = raw

  while (rest.length > 0) {
    const start = rest.indexOf(PRE)
    if (start === -1) {
      segments.push({ text: rest, mark: false })
      break
    }
    if (start > 0) {
      segments.push({ text: rest.slice(0, start), mark: false })
    }
    const afterPre = rest.slice(start + PRE.length)
    const end = afterPre.indexOf(POST)
    if (end === -1) {
      // Unbalanced tag — treat the remainder as plain text (defensive).
      segments.push({ text: afterPre, mark: false })
      break
    }
    segments.push({ text: afterPre.slice(0, end), mark: true })
    rest = afterPre.slice(end + POST.length)
  }

  return segments
}
