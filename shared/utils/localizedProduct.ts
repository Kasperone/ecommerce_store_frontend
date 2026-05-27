/**
 * Localized display fields for a product. Mirrors `localizedCategoryName` in
 * `categoryTree.ts`: falls back to the EN field when the locale is not `pl` or
 * the Polish value is empty. Accepts a loose shape so any product variant
 * carrying `name`/`name_pl` (and optionally `description`/`description_pl`)
 * works — `ProductResponse`, `ProductWithCategory`, cart snapshots, etc.
 */

export function localizedProductName(
  product: { name: string, name_pl?: string | null },
  locale: string,
): string {
  if (locale === 'pl' && product.name_pl) return product.name_pl
  return product.name
}

export function localizedProductDescription(
  product: { description?: string | null, description_pl?: string | null },
  locale: string,
): string | null {
  if (locale === 'pl' && product.description_pl) return product.description_pl
  return product.description ?? null
}
