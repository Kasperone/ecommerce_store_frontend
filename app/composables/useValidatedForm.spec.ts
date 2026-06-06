// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useValidatedForm } from './useValidatedForm'

/**
 * `useValidatedForm` — the shared form-validation flow extracted from
 * `LoginForm`. Tests cover the two form-instance shapes (`<UForm>` exposes the
 * API directly; `<UAuthForm>` nests it under `.formRef`), the `applyApiError`
 * normalize→setErrors→toast chain, and the type-to-clear watch.
 *
 * We feed plain fake instances rather than mounting Nuxt UI — the composable
 * only pokes at `errors` / `setErrors` / `clear` / `state`.
 */

const makeUFormInstance = () => ({
  errors: [] as Array<{ name?: string, message?: string }>,
  setErrors: vi.fn(function (this: { errors: unknown }, errs: unknown) { this.errors = errs }),
  clear: vi.fn(),
  state: {} as Record<string, unknown>,
})

describe('useValidatedForm', () => {
  it('sets errorMessage from a string `detail` error', () => {
    const formRef = ref(makeUFormInstance())
    const { errorMessage, applyApiError } = useValidatedForm(formRef)

    applyApiError({ data: { detail: 'Email already registered' } }, 'fallback')

    expect(errorMessage.value).toBe('Email already registered')
  })

  it('maps FastAPI field errors onto a <UForm> instance via setErrors', async () => {
    const instance = makeUFormInstance()
    const formRef = ref(instance)
    const { applyApiError } = useValidatedForm(formRef)

    applyApiError(
      { data: { detail: [{ loc: ['body', 'email'], msg: 'invalid', type: 'value_error' }] } },
      'fallback',
    )
    await nextTick()

    expect(instance.setErrors).toHaveBeenCalledWith([{ name: 'email', message: 'invalid' }])
  })

  it('resolves the API under .formRef for a <UAuthForm> instance', () => {
    const inner = { errors: [], setErrors: vi.fn(), clear: vi.fn() }
    const formRef = ref({ formRef: inner, state: {} })
    const { applyApiError } = useValidatedForm(formRef)

    applyApiError(
      { data: { detail: [{ loc: ['body', 'password'], msg: 'too short' }] } },
      'fallback',
    )

    expect(inner.setErrors).toHaveBeenCalledWith([{ name: 'password', message: 'too short' }])
  })

  it('raises an error toast when a toast instance is provided', () => {
    const formRef = ref(makeUFormInstance())
    const toast = { add: vi.fn() }
    const { applyApiError } = useValidatedForm(formRef, {
      toast,
      t: (_k, o) => (o?.default as string) ?? _k,
      toastTitleKey: 'errors.title',
    })

    applyApiError({ data: { detail: 'boom' } }, 'Something went wrong')

    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', description: 'boom' }),
    )
  })

  it('falls back to the provided message when the error is not an API shape', () => {
    const formRef = ref(makeUFormInstance())
    const { errorMessage, applyApiError } = useValidatedForm(formRef)

    applyApiError(new Error('[POST] "/x": 502'), 'Network error')

    expect(errorMessage.value).toBe('Network error')
  })

  it('clears a field error and errorMessage when its state value changes', async () => {
    const instance = makeUFormInstance()
    instance.state = { email: '' }
    const formRef = ref(instance)
    const { errorMessage } = useValidatedForm(formRef)

    errorMessage.value = 'previous error'
    // Mutate through the reactive ref proxy so Vue's watch tracks it.
    formRef.value.state.email = 'a@b.com'
    await nextTick()

    expect(instance.clear).toHaveBeenCalledWith('email')
    expect(errorMessage.value).toBe('')
  })

  it('uses an explicit state getter for <UForm> consumers that own :state', async () => {
    const instance = makeUFormInstance()
    const state = ref<Record<string, unknown>>({ name: '' })
    const formRef = ref(instance)
    useValidatedForm(formRef, { state: () => state.value })

    state.value = { name: 'Acme' }
    await nextTick()

    expect(instance.clear).toHaveBeenCalledWith('name')
  })
})
