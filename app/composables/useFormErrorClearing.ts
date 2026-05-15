import { watch, type Ref } from 'vue'

/**
 * Clears a field's validation error as soon as the user types in it,
 * and clears the form-level server error message on any input change.
 */
export function useFormErrorClearing(
  authFormRef: Ref<any>,
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
