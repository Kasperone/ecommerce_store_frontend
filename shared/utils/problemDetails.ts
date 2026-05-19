/**
 * RFC 7807 Problem Details parser.
 *
 * The backend currently returns FastAPI's default `{ detail: string }`
 * HTTPException shape on errors; the umbrella admin-catalog plan flags the
 * RFC 7807 refactor as a future PR. To keep the renderer forward-compatible,
 * we accept both shapes: if `title` is present we prefer it, otherwise we
 * lift `detail` onto `title` so the alert always has something to render.
 *
 * `errors` is the RFC 7807 extension for per-field validation errors. When
 * populated, form components map keys to `UFormField :error` inputs.
 */

export interface ProblemDetails {
  type?: string
  title: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string[]>
}

interface ProblemBodyLike {
  type?: unknown
  title?: unknown
  status?: unknown
  detail?: unknown
  instance?: unknown
  errors?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function coerceErrors(input: unknown): Record<string, string[]> | undefined {
  if (!isObject(input)) return undefined
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
      out[key] = value
    }
    else if (typeof value === 'string') {
      out[key] = [value]
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function parseProblem(err: unknown): ProblemDetails | null {
  if (err == null) return null

  // FetchError shape: `err.data` carries the parsed JSON body.
  // We treat both shapes (RFC 7807 with `title` and FastAPI default with `detail`)
  // as valid; the title is the only required field on the output.
  if (isObject(err) && 'data' in err) {
    const body = (err as { data: unknown }).data
    if (isObject(body)) {
      const b = body as ProblemBodyLike
      const title = typeof b.title === 'string'
        ? b.title
        : typeof b.detail === 'string'
          ? b.detail
          : 'Request failed'
      return {
        type: typeof b.type === 'string' ? b.type : undefined,
        title,
        status: typeof b.status === 'number'
          ? b.status
          : isObject(err) && typeof (err as { status?: unknown }).status === 'number'
            ? (err as { status: number }).status
            : undefined,
        detail: typeof b.detail === 'string' ? b.detail : undefined,
        instance: typeof b.instance === 'string' ? b.instance : undefined,
        errors: coerceErrors(b.errors),
      }
    }
  }

  if (err instanceof Error) {
    return { title: err.message || 'Request failed' }
  }

  if (typeof err === 'string' && err.length > 0) {
    return { title: err }
  }

  return null
}
