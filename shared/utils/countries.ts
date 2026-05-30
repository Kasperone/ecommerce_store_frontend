/**
 * Hand-curated localized country table for the checkout shipping form.
 *
 * The shipping resolver needs a stable key (ISO-2) to look a country up against
 * the configured zones. The checkout form renders a `<USelect>` of localized
 * names mapping to ISO-2 — backend stores the ISO-2 string in
 * `Order.shipping_country`. The list is intentionally short (~30 entries
 * covering PL + EU + key RoW): adding `i18n-iso-countries` would ship ~200
 * names per locale that we don't need; admins can extend this when a new zone
 * needs a country we haven't labelled yet (a warning surfaces below with the
 * ISO-2 code as fallback so the page still works).
 *
 * Convention: the `value` is the upper-case ISO 3166-1 alpha-2 code (what the
 * backend stores + matches on). `label` is the locale-localized name. Lookup
 * helpers normalize input case so callers don't have to think about it.
 */

export type SupportedLocale = 'en' | 'pl'

interface CountryEntry {
  /** ISO 3166-1 alpha-2, upper-case. */
  code: string
  en: string
  pl: string
}

// Order curated so PL surfaces first in dropdowns by default — the seeded
// PL zone + Polish-market norms make this the most-likely choice; everything
// else is sorted alphabetically by EN name.
const COUNTRIES: readonly CountryEntry[] = [
  { code: 'PL', en: 'Poland', pl: 'Polska' },
  { code: 'AT', en: 'Austria', pl: 'Austria' },
  { code: 'AU', en: 'Australia', pl: 'Australia' },
  { code: 'BE', en: 'Belgium', pl: 'Belgia' },
  { code: 'BG', en: 'Bulgaria', pl: 'Bułgaria' },
  { code: 'CA', en: 'Canada', pl: 'Kanada' },
  { code: 'CZ', en: 'Czechia', pl: 'Czechy' },
  { code: 'DE', en: 'Germany', pl: 'Niemcy' },
  { code: 'DK', en: 'Denmark', pl: 'Dania' },
  { code: 'EE', en: 'Estonia', pl: 'Estonia' },
  { code: 'ES', en: 'Spain', pl: 'Hiszpania' },
  { code: 'FI', en: 'Finland', pl: 'Finlandia' },
  { code: 'FR', en: 'France', pl: 'Francja' },
  { code: 'GB', en: 'United Kingdom', pl: 'Wielka Brytania' },
  { code: 'GR', en: 'Greece', pl: 'Grecja' },
  { code: 'HR', en: 'Croatia', pl: 'Chorwacja' },
  { code: 'HU', en: 'Hungary', pl: 'Węgry' },
  { code: 'IE', en: 'Ireland', pl: 'Irlandia' },
  { code: 'IT', en: 'Italy', pl: 'Włochy' },
  { code: 'LT', en: 'Lithuania', pl: 'Litwa' },
  { code: 'LV', en: 'Latvia', pl: 'Łotwa' },
  { code: 'NL', en: 'Netherlands', pl: 'Holandia' },
  { code: 'NO', en: 'Norway', pl: 'Norwegia' },
  { code: 'NZ', en: 'New Zealand', pl: 'Nowa Zelandia' },
  { code: 'PT', en: 'Portugal', pl: 'Portugalia' },
  { code: 'RO', en: 'Romania', pl: 'Rumunia' },
  { code: 'SE', en: 'Sweden', pl: 'Szwecja' },
  { code: 'SI', en: 'Slovenia', pl: 'Słowenia' },
  { code: 'SK', en: 'Slovakia', pl: 'Słowacja' },
  { code: 'US', en: 'United States', pl: 'Stany Zjednoczone' },
] as const

const BY_CODE: Readonly<Record<string, CountryEntry>> = Object.freeze(
  Object.fromEntries(COUNTRIES.map(c => [c.code, c])),
)

/**
 * Localized name for an ISO-2 code, falling back to the upper-cased code
 * when the country isn't in the curated list. Lets the page render
 * something sensible if an admin assigns a zone country we haven't
 * labelled yet (instead of crashing or rendering blank).
 */
export function countryName(code: string | null | undefined, locale: SupportedLocale): string {
  if (!code) return ''
  const normalized = code.toUpperCase()
  const entry = BY_CODE[normalized]
  return entry ? entry[locale] : normalized
}

export interface CountryOption {
  value: string
  label: string
}

/**
 * Build the option list for the checkout country `<USelect>`. PL is first
 * (default for the PL market), every other country is sorted alphabetically
 * by its localized label so the dropdown reads naturally in either language.
 */
export function countryOptions(locale: SupportedLocale): CountryOption[] {
  const [pl, ...rest] = COUNTRIES
  if (!pl) return []
  const others = [...rest].sort((a, b) => a[locale].localeCompare(b[locale], locale))
  return [
    { value: pl.code, label: pl[locale] },
    ...others.map(c => ({ value: c.code, label: c[locale] })),
  ]
}

/** Full curated country code list — used by tests + extra-options validators. */
export const KNOWN_COUNTRY_CODES: readonly string[] = COUNTRIES.map(c => c.code)
