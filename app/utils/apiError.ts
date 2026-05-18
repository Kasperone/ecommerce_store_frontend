import type { ApiError } from '#shared/types/api'

export interface NormalizedApiError {
  message: string
  fieldErrors: Record<string, string>
}

/**
 * Caught-error shape we extract from `$fetch` (`ofetch`) failures.
 * `data` is `unknown` because FastAPI's `detail` is either a string or
 * an array of `{loc, msg, type}` validation entries depending on the
 * response code.
 */
export interface FetchErrorShape {
  status?: number
  data?: { detail?: unknown }
  message?: string
}

const SNAKE_TO_CAMEL_FIELDS: Record<string, string> = {
  first_name: 'firstName',
  last_name: 'lastName',
  confirm_password: 'confirmPassword',
  shipping_street: 'shippingStreet',
  shipping_city: 'shippingCity',
  shipping_postal_code: 'shippingPostalCode',
  shipping_country: 'shippingCountry',
  shipping_state: 'shippingState',
  company_name: 'companyName',
  company_tax_id: 'companyTaxId',
  company_address_street: 'companyAddressStreet',
  company_address_city: 'companyAddressCity',
  company_address_postal_code: 'companyAddressPostalCode',
  company_address_country: 'companyAddressCountry',
  company_address_state: 'companyAddressState',
  new_password: 'password',
  current_password: 'currentPassword',
  username: 'email',
}

const mapField = (raw: string): string => SNAKE_TO_CAMEL_FIELDS[raw] ?? raw

const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null

/**
 * Normalize an `unknown` caught from `$fetch` into the fields we actually
 * read across the codebase. `error?.response?.status` and `error?.status`
 * both appear in the wild (the first is what ofetch sets, the second is
 * what older retry wrappers surface), so we fall back across both.
 *
 * Returns an empty object when the input isn't an object — callers can
 * destructure without null checks.
 */
export function narrowFetchError(err: unknown): FetchErrorShape {
  if (!isObject(err)) return {}

  const response = isObject(err.response) ? err.response : null
  const statusFromResponse
    = response && typeof response.status === 'number' ? response.status : undefined
  const statusFromTop = typeof err.status === 'number' ? err.status : undefined

  const dataFromTop = isObject(err.data) ? (err.data as { detail?: unknown }) : undefined
  const dataFromResponse
    = response && isObject(response._data)
      ? (response._data as { detail?: unknown })
      : undefined

  return {
    status: statusFromResponse ?? statusFromTop,
    data: dataFromTop ?? dataFromResponse,
    message: typeof err.message === 'string' ? err.message : undefined,
  }
}

/**
 * Normalize a thrown error from `useApi()` / `$fetch` into a readable message
 * and a per-field error map. Handles:
 *  - FastAPI validation errors (`detail` is an array of `{loc, msg, type}`)
 *  - String `detail` errors
 *  - Network / unexpected errors
 */
export function normalizeApiError(
  error: unknown,
  fallback: string,
): NormalizedApiError {
  const fieldErrors: Record<string, string> = {}
  const { data, message } = narrowFetchError(error)

  let detail: unknown
  if (isObject(data) && 'detail' in data) {
    detail = (data as ApiError | { detail: unknown }).detail
  }

  if (typeof detail === 'string' && detail.trim().length > 0) {
    return { message: detail, fieldErrors }
  }

  if (Array.isArray(detail)) {
    const messages: string[] = []
    for (const item of detail) {
      if (!isObject(item)) continue
      const loc = item.loc as unknown[] | undefined
      const msg = typeof item.msg === 'string' ? item.msg : undefined
      if (!msg) continue
      messages.push(msg)
      if (Array.isArray(loc) && loc.length > 1) {
        const rawField = String(loc[loc.length - 1])
        const field = mapField(rawField)
        if (!fieldErrors[field]) fieldErrors[field] = msg
      }
    }
    return {
      message: messages[0] ?? fallback,
      fieldErrors,
    }
  }

  if (typeof message === 'string' && message.trim().length > 0) {
    return { message, fieldErrors }
  }

  return { message: fallback, fieldErrors }
}

/**
 * Pre-normalized error string from auth store (already extracted detail).
 * If it looks like a stringified array/object, try to parse for readability.
 */
export function readableAuthStoreError(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  const trimmed = raw.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const msgs = parsed
          .map((p: unknown) => (isObject(p) && typeof p.msg === 'string' ? p.msg : null))
          .filter(Boolean)
        if (msgs.length) return msgs.join('. ')
      }
      else if (isObject(parsed) && typeof parsed.detail === 'string') {
        return parsed.detail
      }
    }
    catch {
      // fall through
    }
  }
  return trimmed
}

/**
 * Scroll the first invalid field into view and focus it.
 * Pass the array of UForm errors (each with an `id`).
 */
export function scrollToFirstFormError(errors: Array<{ id?: string, name?: string }> | undefined) {
  if (!errors?.length || typeof document === 'undefined') return
  const first = errors[0]
  if (!first) return
  const el
    = (first.id && document.getElementById(first.id))
      || (first.name && document.querySelector<HTMLElement>(`[name="${first.name}"]`))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // Focus after scroll settles
  setTimeout(() => {
    if (typeof (el as HTMLElement).focus === 'function') {
      ;(el as HTMLElement).focus({ preventScroll: true })
    }
  }, 250)
}
