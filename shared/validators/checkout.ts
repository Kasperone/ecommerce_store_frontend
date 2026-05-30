/**
 * Zod validator for the checkout shipping form.
 *
 * Field constraints mirror the backend `OrderCreate` (`app/schemas/order.py`):
 * shipping_address (required), shipping_city (≤100), shipping_postal_code (≤20),
 * shipping_country (ISO-2 — backend stores `String(100)` but the storefront
 * only ever writes ISO-2 codes via the country `<USelect>`), optional notes.
 * The backend re-validates on the wire.
 *
 * `shipping_method_id` is owned by `<CheckoutShippingMethodSelector>` (state
 * lifted into `/checkout/index.vue`) — it is NOT in the form's data shape,
 * so it lives outside this schema. The page-level submit guard refuses to
 * call `useCreateOrder` until a method is picked.
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
    // ISO 3166-1 alpha-2 (uppercase). The country <USelect> emits values from
    // shared/utils/countries.ts; the regex pins it so a future free-text path
    // can't bypass the resolver contract (which 422s on a non-ISO-2 country).
    country: _required(t, 'checkout.errors.countryRequired', 'Country is required')
      .regex(/^[A-Z]{2}$/, {
        error: t('checkout.errors.countryInvalid', { default: 'Select a country' }),
      }),
    notes: z.string()
      .max(1000, { error: t('checkout.errors.notesTooLong', { default: 'Notes must be 1000 characters or fewer' }) })
      .optional(),
  })

export type ShippingInput = z.infer<ReturnType<typeof createShippingSchema>>
