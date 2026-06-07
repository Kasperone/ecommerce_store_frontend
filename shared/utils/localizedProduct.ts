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

/**
 * SEO meta-title fallback chain (mirrors the category page):
 * locale meta_title → EN meta_title → localized product name.
 */
export function localizedProductMetaTitle(
  product: {
    name: string
    name_pl?: string | null
    meta_title?: string | null
    meta_title_pl?: string | null
  },
  locale: string,
): string {
  const localized = locale === 'pl' ? product.meta_title_pl : product.meta_title
  return localized || product.meta_title || localizedProductName(product, locale)
}

/**
 * SEO meta-description fallback chain (mirrors the category page):
 * locale meta_description → EN meta_description → localized description.
 */
export function localizedProductMetaDescription(
  product: {
    description?: string | null
    description_pl?: string | null
    meta_description?: string | null
    meta_description_pl?: string | null
  },
  locale: string,
): string | null {
  const localized = locale === 'pl' ? product.meta_description_pl : product.meta_description
  return localized || product.meta_description || localizedProductDescription(product, locale)
}
