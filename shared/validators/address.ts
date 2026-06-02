/**
 * Zod validator for the address-book form
 * (`<AccountAddressesAddressForm>`).
 *
 * Field constraints mirror the backend `AddressCreate` (`app/schemas/address.py`)
 * and re-use the checkout shipping-field shapes: street (required, ≤255), city
 * (required, ≤100), postal_code (required, ≤20), country (required ISO-2). The
 * phone field re-uses the loose phone rule from the profile validator (length
 * cap + permissive character set). `label`, `state` and `phone` are optional.
 * The two `is_default_*` flags are plain booleans (server enforces mutual
 * exclusion). The backend re-validates on the wire.
 */

import { z } from 'zod'
import type { TranslateFunction } from './auth'

const PHONE_PATTERN = /^[\d\s+()-]+$/

const _required = (t: TranslateFunction, key: string, def: string) =>
  z.string({
    error: issue => issue.input === undefined ? t(key, { default: def }) : 'Invalid input',
  }).trim().min(1, { error: t(key, { default: def }) })

export const createAddressSchema = (t: TranslateFunction) =>
  z.object({
    label: z.string()
      .max(100, { error: t('account.settings.addresses.errors.labelTooLong', { default: 'Label must be 100 characters or fewer' }) })
      .optional()
      .or(z.literal('')),
    recipient_name: _required(t, 'account.settings.addresses.errors.recipientRequired', 'Recipient name is required')
      .max(255, { error: t('account.settings.addresses.errors.recipientTooLong', { default: 'Recipient name must be 255 characters or fewer' }) }),
    street: _required(t, 'account.settings.addresses.errors.streetRequired', 'Street is required')
      .max(255, { error: t('account.settings.addresses.errors.streetTooLong', { default: 'Street must be 255 characters or fewer' }) }),
    city: _required(t, 'account.settings.addresses.errors.cityRequired', 'City is required')
      .max(100, { error: t('account.settings.addresses.errors.cityTooLong', { default: 'City must be 100 characters or fewer' }) }),
    postal_code: _required(t, 'account.settings.addresses.errors.postalRequired', 'Postal code is required')
      .max(20, { error: t('account.settings.addresses.errors.postalTooLong', { default: 'Postal code must be 20 characters or fewer' }) }),
    // ISO 3166-1 alpha-2 (uppercase) — emitted by the country <USelect>; pins
    // the resolver contract just like the checkout schema does.
    country: _required(t, 'account.settings.addresses.errors.countryRequired', 'Country is required')
      .regex(/^[A-Z]{2}$/, {
        error: t('account.settings.addresses.errors.countryInvalid', { default: 'Select a country' }),
      }),
    state: z.string()
      .max(100, { error: t('account.settings.addresses.errors.stateTooLong', { default: 'State must be 100 characters or fewer' }) })
      .optional()
      .or(z.literal('')),
    phone: z.string()
      .trim()
      .max(32, { error: t('account.settings.addresses.errors.phoneInvalid', { default: 'Enter a valid phone number' }) })
      .regex(PHONE_PATTERN, { error: t('account.settings.addresses.errors.phoneInvalid', { default: 'Enter a valid phone number' }) })
      .optional()
      .or(z.literal('')),
    is_default_shipping: z.boolean(),
    is_default_billing: z.boolean(),
  })

export type AddressInput = z.infer<ReturnType<typeof createAddressSchema>>
