import { z } from 'zod'

/**
 * Base validation schemas for auth forms.
 * These functions accept i18n translate function to provide localized error messages.
 */

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
    error: (issue) => issue.input === undefined ? 'Password is required' : `Invalid input` 
  }).min(minLength, { error: errorMessage }).max(100)

/**
 * Name validation - reusable for firstName/lastName
 */
export const createNameValidation = (minLength = 1, errorMessage = 'This field is required') => 
  z.string({ 
    error: (issue) => issue.input === undefined ? errorMessage : `Invalid input` 
  }).min(minLength, { error: errorMessage })

/**
 * Optional nullable string - for form fields that can be empty
 */
export const optionalNullableString = () => z.string().optional().nullable()

/**
 * Creates login schema with i18n support
 */
export const createLoginSchema = (t: (key: string, options?: any) => string) => 
  z.object({
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' })),
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    remember: z.boolean().optional()
  })

/**
 * Creates personal signup schema with i18n support
 */
export const createPersonalSignUpSchema = (t: (key: string, options?: any) => string) => 
  z.object({
    firstName: createNameValidation(1, t('auth.errors.firstNameRequired', { default: 'First name is required' })),
    lastName: createNameValidation(1, t('auth.errors.lastNameRequired', { default: 'Last name is required' })),
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' })),
    phone: z.string().optional(),
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    confirmPassword: z.string({ 
      error: (issue) => issue.input === undefined ? t('auth.errors.confirmPasswordRequired', { default: 'Confirm password is required' }) : `Invalid input` 
    }),
    // Shipping fields
    shipping_street: optionalNullableString(),
    shipping_city: optionalNullableString(),
    shipping_postal_code: optionalNullableString(),
    shipping_country: optionalNullableString(),
    shipping_state: optionalNullableString()
  }).superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: t('auth.errors.passwordsDontMatch', { default: 'Passwords do not match' }),
        path: ['confirmPassword']
      })
    }
  })

/**
 * Creates business signup schema with i18n support
 */
export const createBusinessSignUpSchema = (t: (key: string, options?: any) => string) => 
  z.object({
    firstName: createNameValidation(1, t('auth.errors.firstNameRequired', { default: 'First name is required' })),
    lastName: createNameValidation(1, t('auth.errors.lastNameRequired', { default: 'Last name is required' })),
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' })),
    phone: z.string().optional(),
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    confirmPassword: z.string({ 
      error: (issue) => issue.input === undefined ? t('auth.errors.confirmPasswordRequired', { default: 'Confirm password is required' }) : `Invalid input` 
    }),
    // Company fields
    company_name: createNameValidation(1, t('auth.errors.companyNameRequired', { default: 'Company name is required' })),
    company_tax_id: optionalNullableString(),
    company_address_street: optionalNullableString(),
    company_address_city: optionalNullableString(),
    company_address_postal_code: optionalNullableString(),
    company_address_country: optionalNullableString(),
    company_address_state: optionalNullableString()
  }).superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: t('auth.errors.passwordsDontMatch', { default: 'Passwords do not match' }),
        path: ['confirmPassword']
      })
    }
  })

/**
 * Legacy combined signup schema - kept for backward compatibility
 */
export const createSignUpSchema = (t: (key: string, options?: any) => string) => 
  z.object({
    firstName: createNameValidation(1, t('auth.errors.firstNameRequired', { default: 'First name is required' })),
    lastName: createNameValidation(1, t('auth.errors.lastNameRequired', { default: 'Last name is required' })),
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' })),
    phone: z.string().optional(),
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    confirmPassword: z.string({ 
      error: (issue) => issue.input === undefined ? t('auth.errors.confirmPasswordRequired', { default: 'Confirm password is required' }) : `Invalid input` 
    }),
    // Shipping fields
    shipping_street: optionalNullableString(),
    shipping_city: optionalNullableString(),
    shipping_postal_code: optionalNullableString(),
    shipping_country: optionalNullableString(),
    shipping_state: optionalNullableString(),
    // Company fields
    company_name: optionalNullableString(),
    company_tax_id: optionalNullableString(),
    company_address_street: optionalNullableString(),
    company_address_city: optionalNullableString(),
    company_address_postal_code: optionalNullableString(),
    company_address_country: optionalNullableString(),
    company_address_state: optionalNullableString()
  }).superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: t('auth.errors.passwordsDontMatch', { default: 'Passwords do not match' }),
        path: ['confirmPassword']
      })
    }
  })

/**
 * Creates forgot password schema with i18n support
 */
export const createForgotPasswordSchema = (t: (key: string, options?: any) => string) => 
  z.object({
    email: createEmailValidation(t('auth.errors.invalidEmail', { default: 'Invalid email' }))
  })

/**
 * Creates reset password schema with i18n support
 */
export const createResetPasswordSchema = (t: (key: string, options?: any) => string) => 
  z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: createPasswordValidation(8, t('auth.errors.passwordMin', { count: 8, default: 'Must be at least 8 characters' })),
    confirmPassword: z.string()
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('auth.errors.passwordsDontMatch', { default: "Passwords don't match" }),
    path: ["confirmPassword"]
  })

/**
 * TypeScript types for form data
 * These are inferred from the schema functions when called
 */
export type LoginFormData = z.infer<ReturnType<typeof createLoginSchema>>
export type PersonalSignUpFormData = z.infer<ReturnType<typeof createPersonalSignUpSchema>>
export type BusinessSignUpFormData = z.infer<ReturnType<typeof createBusinessSignUpSchema>>
export type SignUpFormData = z.infer<ReturnType<typeof createSignUpSchema>> // Legacy type
export type ForgotPasswordFormData = z.infer<ReturnType<typeof createForgotPasswordSchema>>
export type ResetPasswordFormData = z.infer<ReturnType<typeof createResetPasswordSchema>>

/**
 * Helper type for i18n translate function
 */
export type TranslateFunction = (key: string, options?: any) => string
