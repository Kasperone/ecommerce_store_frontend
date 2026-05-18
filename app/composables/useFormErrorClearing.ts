import { watch, type Ref } from 'vue'

/**
 * Subset of the Nuxt UI 4 `UAuthForm` exposed instance that this codebase
 * actually pokes at. `setErrors` writes server-side validation errors back
 * onto the form; `clear` wipes a single field's validation as soon as the
 * user starts typing again; `errors` is consumed by `scrollToFirstFormError`.
 *
 * Defined locally instead of importing from `@nuxt/ui` because the UAuthForm
 * instance type isn't exported as a value; capturing only the surface we
 * use keeps the coupling honest.
 */
export interface AuthFormInstance {
  errors?: Array<{ id?: string, name?: string, message?: string }>
  setErrors: (errors: Array<{ name: string, message: string }>) => void
  clear?: (path?: string) => void
}

export interface AuthFormPublicInstance {
  state?: Record<string, unknown>
  formRef?: AuthFormInstance
}

/**
 * Clears a field's validation error as soon as the user types in it,
 * and clears the form-level server error message on any input change.
 */
export function useFormErrorClearing(
  authFormRef: Ref<AuthFormPublicInstance | null>,
  errorMessage?: Ref<string>,
) {
  let prev: Record<string, unknown> = {}

  watch(
    () => {
      const s = authFormRef.value?.state
      return s ? { ...s } : null
    },
    (newState) => {
      if (!newState) return
      const formApi = authFormRef.value?.formRef
      for (const key in newState) {
        if (newState[key] !== prev[key]) {
          formApi?.clear?.(key)
          if (errorMessage && errorMessage.value) errorMessage.value = ''
        }
      }
      prev = newState
    },
    { deep: true },
  )
}
