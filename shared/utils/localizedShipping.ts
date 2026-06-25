/**
 * Locale-aware display copy for a shipping method. Mirrors `localizedProductName`
 * / `localizedCategoryName`: falls back to the EN field when the locale is not
 * `pl` or the Polish value is empty. Accepts a loose shape so any method
 * carrying `name`/`name_pl` (and optionally `description`/`description_pl`)
 * works — the admin `ShippingMethodResponse`, the storefront `ShippingQuoteMethod`,
 * etc.
 */

export function localizedShippingMethodName(
  method: { name: string, name_pl?: string | null },
  locale: string,
): string {
  if (locale === 'pl' && method.name_pl) return method.name_pl
  return method.name
}

export function localizedShippingMethodDescription(
  method: { description?: string | null, description_pl?: string | null },
  locale: string,
): string | null {
  if (locale === 'pl' && method.description_pl) return method.description_pl
  return method.description ?? null
}
