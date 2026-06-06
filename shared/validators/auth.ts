import { z } from 'zod'

/**
 * Base validation schemas for auth forms.
 * These functions accept i18n translate function to provide localized error messages.
 */

/**
 * Helper type for the vue-i18n translate function.
 *
 * `Record<string, unknown>` covers every call shape we use today:
 * - `{ default: '...' }` fallback copy
 * - `{ count: N, default: '...' }` for pluralized keys
 */
export type TranslateFunction = (key: string, options?: Record<string, unknown>) => string

/**
 * Email validation - reusable across all forms
 */
export const createEmailValidation = (errorMessage = 'Invalid email address') =>
  z.email({ message: errorMessage })

/**
 * Password validation - reusable with configurable minimum length
 */
export const createPasswordValidation = (minLength = 8, errorMessage = `Must be at least ${minLength} characters`) =>
  z.string({
    error: issue => issue.input === undefined ? 'Password is required' : `Invalid input`,
  }).min(minLength, { error: errorMessage }).max(100)

/**
 * Name validation - reusable for firstName/lastName
 */
export const createNameValidation = (minLength = 1, errorMessage = 'This field is required') =>
  z.string({
    error: issue => issue.input === undefined ? errorMessage : `Invalid input`,
  }).min(minLength, { error: errorMessage })

/**
 * Optional nullable string - for form fields that can be empty
 */
export const optionalNullableString = () => z.string().optional().nullable()

/**
 * Creates login schema with i18n support
 */
export const createLoginSchema = (t: TranslateFunction) =>
  z.object({
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' })),
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    remember: z.boolean().optional(),
  })

/**
 * Creates personal signup schema with i18n support
 */
export const createPersonalSignUpSchema = (t: TranslateFunction) =>
  z.object({
    firstName: createNameValidation(1, t('auth.errors.firstNameRequired', { default: 'First name is required' })),
    lastName: createNameValidation(1, t('auth.errors.lastNameRequired', { default: 'Last name is required' })),
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' })),
    phone: optionalNullableString(),
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    confirmPassword: z.string({
      error: issue => issue.input === undefined ? t('auth.errors.confirmPasswordRequired', { default: 'Confirm password is required' }) : `Invalid input`,
    }),
  }).superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: t('auth.errors.passwordsDontMatch', { default: 'Passwords do not match' }),
        path: ['confirmPassword'],
      })
    }
  })

/**
 * Creates business signup schema with i18n support
 */
export const createBusinessSignUpSchema = (t: TranslateFunction) =>
  z.object({
    firstName: createNameValidation(1, t('auth.errors.firstNameRequired', { default: 'First name is required' })),
    lastName: createNameValidation(1, t('auth.errors.lastNameRequired', { default: 'Last name is required' })),
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' })),
    phone: optionalNullableString(),
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    confirmPassword: z.string({
      error: issue => issue.input === undefined ? t('auth.errors.confirmPasswordRequired', { default: 'Confirm password is required' }) : `Invalid input`,
    }),
    // Company fields
    companyName: createNameValidation(1, t('auth.errors.companyNameRequired', { default: 'Company name is required' })),
    companyTaxId: optionalNullableString(),
    companyAddressStreet: optionalNullableString(),
    companyAddressCity: optionalNullableString(),
    companyAddressPostalCode: optionalNullableString(),
    companyAddressCountry: optionalNullableString(),
    companyAddressState: optionalNullableString(),
  }).superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: t('auth.errors.passwordsDontMatch', { default: 'Passwords do not match' }),
        path: ['confirmPassword'],
      })
    }
  })

/**
 * Creates forgot password schema with i18n support
 */
export const createForgotPasswordSchema = (t: TranslateFunction) =>
  z.object({
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' })),
  })

/**
 * Creates reset password schema with i18n support.
 *
 * The reset token is a URL param consumed by the page (`route.params.token`) and
 * passed to the auth store action directly — it never enters the form's state.
 * `<UAuthForm>` rebuilds its validation state from the `:fields` prop, so any
 * schema key without a matching field is dropped before Zod runs. Listing
 * `token` here would fail validation silently with nowhere to render the error.
 */
export const createResetPasswordSchema = (t: TranslateFunction) =>
  z.object({
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    confirmPassword: z.string(),
  }).refine(data => data.password === data.confirmPassword, {
    message: t('auth.errors.passwordsDontMatch', { default: 'Passwords don\'t match' }),
    path: ['confirmPassword'],
  })

/**
 * Creates the change-password schema with i18n support.
 *
 * Uses snake_case keys to match the account/security page's form state and the
 * backend payload (current_password / new_password). The confirm field is a
 * client-only cross-check, dropped before the request is built.
 */
export const createChangePasswordSchema = (t: TranslateFunction) =>
  z.object({
    current_password: z
      .string()
      .min(1, t('account.settings.security.password.errors.currentRequired', { default: 'Current password is required' })),
    new_password: z
      .string()
      .min(8, t('account.settings.security.password.errors.tooShort', { count: 8, default: 'Must be at least 8 characters' }))
      .max(100),
    confirm_password: z.string(),
  }).superRefine((val, ctx) => {
    if (val.new_password !== val.confirm_password) {
      ctx.addIssue({
        code: 'custom',
        message: t('account.settings.security.password.errors.mismatch', { default: 'Passwords don\'t match' }),
        path: ['confirm_password'],
      })
    }
  })

/**
 * TypeScript types for form data
 * These are inferred from the schema functions when called
 */
export type LoginFormData = z.infer<ReturnType<typeof createLoginSchema>>
export type PersonalSignUpFormData = z.infer<ReturnType<typeof createPersonalSignUpSchema>>
export type BusinessSignUpFormData = z.infer<ReturnType<typeof createBusinessSignUpSchema>>
export type ForgotPasswordFormData = z.infer<ReturnType<typeof createForgotPasswordSchema>>
export type ResetPasswordFormData = z.infer<ReturnType<typeof createResetPasswordSchema>>
export type ChangePasswordFormData = z.infer<ReturnType<typeof createChangePasswordSchema>>
