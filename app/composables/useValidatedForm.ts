import { ref, watch, nextTick, type Ref } from 'vue'
import { normalizeApiError, scrollToFirstFormError } from '~/utils/apiError'

/**
 * The slice of a Nuxt UI 4 form instance this composable pokes at.
 * `errors` is consumed by `scrollToFirstFormError`; `setErrors` writes
 * server-side validation errors back onto the inputs; `clear` wipes a single
 * field's validation as soon as the user types again.
 */
export interface ValidatedFormApi {
  errors?: Array<{ id?: string, name?: string, message?: string }>
  setErrors: (errors: Array<{ name: string, message: string }>) => void
  clear?: (path?: string) => void
}

/**
 * A template-ref'd form instance. `<UForm>` exposes the form API directly on
 * the instance; `<UAuthForm>` nests it under `.formRef` and re-exposes `state`.
 * We accept both shapes and resolve the real API in {@link resolveFormApi}.
 */
export interface ValidatedFormInstance {
  state?: Record<string, unknown>
  formRef?: ValidatedFormApi
  errors?: ValidatedFormApi['errors']
  setErrors?: ValidatedFormApi['setErrors']
  clear?: ValidatedFormApi['clear']
}

export interface UseValidatedFormOptions {
  /**
   * vue-i18n `t` — required only if you want `applyApiError` to raise a toast.
   */
  t?: (key: string, options?: Record<string, unknown>) => string
  /**
   * The Nuxt UI `useToast()` instance — pass it if you want `applyApiError`
   * to surface an error toast (mirrors the LoginForm flow).
   */
  toast?: { add: (opts: Record<string, unknown>) => void }
  /**
   * i18n key for the error toast title. Defaults to a generic key.
   */
  toastTitleKey?: string
  /**
   * Explicit reactive form state for the error-clearing watch. `<UForm>`
   * consumers own their `:state` object, so pass `() => state` here. Omit for
   * `<UAuthForm>`, which exposes `.state` on the instance itself.
   */
  state?: () => Record<string, unknown> | null | undefined
}

const resolveFormApi = (
  instance: ValidatedFormInstance | null | undefined,
): ValidatedFormApi | null => {
  if (!instance) return null
  if (typeof instance.setErrors === 'function') {
    return instance as ValidatedFormApi
  }
  if (instance.formRef && typeof instance.formRef.setErrors === 'function') {
    return instance.formRef
  }
  return null
}

/**
 * Bundles the four cross-cutting behaviours that make every form behave like
 * the gold-standard `LoginForm`:
 *
 *  1. **Scroll-to-error** — watches the form's `errors` and scrolls + focuses
 *     the first invalid field whenever client-side (Zod) validation fails.
 *  2. **Error-clearing** — clears a field's validation error as soon as the
 *     user types in it, and clears the form-level `errorMessage`.
 *  3. **`applyApiError`** — normalizes a thrown `$fetch`/store error into a
 *     readable message + per-field map, sets `errorMessage`, pushes backend
 *     field errors under the matching inputs via `setErrors`, scrolls to the
 *     first one, and (optionally) raises an error toast.
 *  4. Owns the `errorMessage` ref used by the `#validation`/`UAlert` slot.
 *
 * Forms still own their Zod schema (`createXxxSchema(t)`) and
 * `:validate-on="[]"`; this composable owns everything downstream of
 * a submit.
 */
export function useValidatedForm(
  formRef: Ref<ValidatedFormInstance | null>,
  options: UseValidatedFormOptions = {},
) {
  const errorMessage = ref('')

  // 1. Scroll to the first invalid field on client-side validation failure.
  watch(
    () => resolveFormApi(formRef.value)?.errors,
    (errs) => {
      if (errs && errs.length > 0) {
        void nextTick(() => scrollToFirstFormError(errs))
      }
    },
    { deep: true },
  )

  // 2. Clear field + form-level errors as the user edits.
  let prev: Record<string, unknown> = {}
  watch(
    () => {
      const s = options.state ? options.state() : formRef.value?.state
      return s ? { ...s } : null
    },
    (newState) => {
      if (!newState) return
      const api = resolveFormApi(formRef.value)
      for (const key in newState) {
        if (newState[key] !== prev[key]) {
          api?.clear?.(key)
          if (errorMessage.value) errorMessage.value = ''
        }
      }
      prev = newState
    },
    { deep: true },
  )

  // 3. Map a thrown API error onto the form (+ optional toast).
  const applyApiError = (raw: unknown, fallback: string) => {
    const normalized = normalizeApiError(raw, fallback)
    errorMessage.value = normalized.message

    const api = resolveFormApi(formRef.value)
    if (api && Object.keys(normalized.fieldErrors).length > 0) {
      api.setErrors(
        Object.entries(normalized.fieldErrors).map(([name, message]) => ({ name, message })),
      )
      void nextTick(() => scrollToFirstFormError(api.errors))
    }

    if (options.toast) {
      const title = options.t && options.toastTitleKey
        ? options.t(options.toastTitleKey, { default: fallback })
        : fallback
      options.toast.add({
        title,
        description: normalized.message,
        color: 'error',
        icon: 'i-lucide-circle-x',
      })
    }

    return normalized
  }

  return { errorMessage, applyApiError }
}
