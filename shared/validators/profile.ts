import { z } from 'zod'
import { createNameValidation, type TranslateFunction } from './auth'

/**
 * Validation schema for the account profile settings form
 * (`app/pages/account/settings/profile.vue`).
 *
 * Reuses `createNameValidation` from `auth.ts` (imported, not redefined) so the
 * first/last-name rules stay in lockstep with sign-up. Phone is optional and
 * validated loosely — matches the signup form, where `phone` is an
 * `optionalNullableString()` with no format enforcement; we only cap the length
 * and accept the common phone characters so a fat-fingered free-text entry is
 * caught without rejecting international formats.
 */

const PHONE_PATTERN = /^[\d\s+()-]+$/

export const createProfileSchema = (t: TranslateFunction) =>
  z.object({
    first_name: createNameValidation(
      1,
      t('account.settings.profile.errors.firstNameRequired', { default: 'First name is required' }),
    ),
    last_name: createNameValidation(
      1,
      t('account.settings.profile.errors.lastNameRequired', { default: 'Last name is required' }),
    ),
    phone: z
      .string()
      .trim()
      .max(32, t('account.settings.profile.errors.phoneInvalid', { default: 'Enter a valid phone number' }))
      .regex(PHONE_PATTERN, t('account.settings.profile.errors.phoneInvalid', { default: 'Enter a valid phone number' }))
      .optional()
      .or(z.literal('')),
  })

export type ProfileFormData = z.infer<ReturnType<typeof createProfileSchema>>
