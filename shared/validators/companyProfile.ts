/**
 * Zod validator for the B2B company-profile form
 * (`<AccountCompanyProfileForm>`, COMPANY_ADMIN-only).
 *
 * Mirrors the backend `CompanyProfileUpdate` narrow allow-list
 * (`app/schemas/company.py`, Wave D / D-D-4): the editable contact + billing
 * profile plus `default_currency`. **Every field is optional** — the PATCH is
 * partial and the page only sends what changed; a cleared field is sent as an
 * empty string, which the backend trims to `null`. `name` / `status` /
 * `account_manager` are NOT here (admin-directory concerns). The backend
 * re-validates and is the source of truth.
 */

import { z } from 'zod'
import type { TranslateFunction } from './auth'

const PHONE_PATTERN = /^[\d\s+()-]+$/

/** A 3-letter ISO-4217 currency code (upper-case), or empty to clear it. */
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/

const _optionalText = (max: number, tooLongKey: string, tooLongDef: string, t: TranslateFunction) =>
  z.string()
    .trim()
    .max(max, { error: t(tooLongKey, { default: tooLongDef }) })
    .optional()
    .or(z.literal(''))

export const createCompanyProfileSchema = (t: TranslateFunction) =>
  z.object({
    tax_id: _optionalText(64, 'account.settings.company.errors.taxIdTooLong', 'Tax ID must be 64 characters or fewer', t),
    // EU VAT-ID (country-prefixed). Lenient here — the backend normalises spaces
    // and format-checks it (422 surfaced via the gold flow); empty clears it.
    vat_id: _optionalText(20, 'account.settings.company.errors.vatIdTooLong', 'VAT ID must be 20 characters or fewer', t),
    regon: _optionalText(64, 'account.settings.company.errors.regonTooLong', 'REGON must be 64 characters or fewer', t),
    // Email: validate the format only when something is typed; empty clears it.
    email: z.union([
      z.literal(''),
      z.email({ error: t('account.settings.company.errors.emailInvalid', { default: 'Enter a valid email address' }) })
        .max(255, { error: t('account.settings.company.errors.emailTooLong', { default: 'Email must be 255 characters or fewer' }) }),
    ]).optional(),
    phone: z.string()
      .trim()
      .max(32, { error: t('account.settings.company.errors.phoneInvalid', { default: 'Enter a valid phone number' }) })
      .regex(PHONE_PATTERN, { error: t('account.settings.company.errors.phoneInvalid', { default: 'Enter a valid phone number' }) })
      .optional()
      .or(z.literal('')),
    billing_address_street: _optionalText(255, 'account.settings.company.errors.streetTooLong', 'Street must be 255 characters or fewer', t),
    billing_address_city: _optionalText(100, 'account.settings.company.errors.cityTooLong', 'City must be 100 characters or fewer', t),
    billing_address_postal_code: _optionalText(20, 'account.settings.company.errors.postalTooLong', 'Postal code must be 20 characters or fewer', t),
    billing_address_country: _optionalText(100, 'account.settings.company.errors.countryTooLong', 'Country must be 100 characters or fewer', t),
    billing_address_state: _optionalText(100, 'account.settings.company.errors.stateTooLong', 'State must be 100 characters or fewer', t),
    // 3-letter code (the backend upper-cases it); empty clears it.
    default_currency: z.string()
      .trim()
      .regex(CURRENCY_PATTERN, { error: t('account.settings.company.errors.currencyInvalid', { default: 'Use a 3-letter currency code, e.g. USD' }) })
      .optional()
      .or(z.literal('')),
  })

export type CompanyProfileInput = z.infer<ReturnType<typeof createCompanyProfileSchema>>
