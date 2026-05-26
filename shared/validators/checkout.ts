/**
 * Zod validator for the checkout shipping form.
 *
 * Field constraints mirror the backend `OrderCreate` (`app/schemas/order.py`):
 * shipping_address (required), shipping_city (≤100), shipping_postal_code (≤20),
 * shipping_country (≤100), optional notes. The backend re-validates on the wire.
 */

import { z } from 'zod'
import type { TranslateFunction } from './auth'

const _required = (t: TranslateFunction, key: string, def: string) =>
  z.string({
    error: issue => issue.input === undefined ? t(key, { default: def }) : 'Invalid input',
  }).min(1, { error: t(key, { default: def }) })

export const createShippingSchema = (t: TranslateFunction) =>
  z.object({
    address: _required(t, 'checkout.errors.addressRequired', 'Address is required')
      .max(255, { error: t('checkout.errors.addressTooLong', { default: 'Address must be 255 characters or fewer' }) }),
    city: _required(t, 'checkout.errors.cityRequired', 'City is required')
      .max(100, { error: t('checkout.errors.cityTooLong', { default: 'City must be 100 characters or fewer' }) }),
    postalCode: _required(t, 'checkout.errors.postalRequired', 'Postal code is required')
      .max(20, { error: t('checkout.errors.postalTooLong', { default: 'Postal code must be 20 characters or fewer' }) }),
    country: _required(t, 'checkout.errors.countryRequired', 'Country is required')
      .max(100, { error: t('checkout.errors.countryTooLong', { default: 'Country must be 100 characters or fewer' }) }),
    notes: z.string()
      .max(1000, { error: t('checkout.errors.notesTooLong', { default: 'Notes must be 1000 characters or fewer' }) })
      .optional(),
  })

export type ShippingInput = z.infer<ReturnType<typeof createShippingSchema>>
