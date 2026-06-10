/**
 * Zod validators for the admin products form.
 *
 * Shape comes from the codegen'd `ProductCreate` / `ProductUpdate` in
 * `shared/types/api.ts` — these validators own constraints only.
 */

import { z } from 'zod'
import type { TranslateFunction } from './auth'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const _string = (msg: string) =>
  z.string({
    error: issue => issue.input === undefined ? msg : 'Invalid input',
  })

/**
 * Merchant identity + per-locale SEO meta fields (SEO blueprint D11) —
 * identical constraints on create and update, all optional/nullable. Lengths
 * mirror the backend's column sizes + CHECK constraints (meta 70/160).
 */
const _merchantSeoFields = (t: TranslateFunction) => ({
  brand: z.string().max(100, { error: t('admin.products.errors.brandTooLong', { default: 'Brand must be 100 characters or fewer' }) }).optional().nullable(),
  gtin: z.string().max(14, { error: t('admin.products.errors.gtinTooLong', { default: 'GTIN must be 14 characters or fewer' }) }).optional().nullable(),
  mpn: z.string().max(70, { error: t('admin.products.errors.mpnTooLong', { default: 'MPN must be 70 characters or fewer' }) }).optional().nullable(),
  condition: z.enum(['new', 'refurbished', 'used'], {
    error: t('admin.products.errors.conditionInvalid', { default: 'Condition must be new, refurbished, or used' }),
  }).optional(),
  google_product_category: z.string().max(20, { error: t('admin.products.errors.googleProductCategoryTooLong', { default: 'Google Product Category must be 20 characters or fewer' }) }).optional().nullable(),
  meta_title: z.string().max(70, { error: t('admin.products.errors.metaTitleTooLong', { default: 'Meta title must be 70 characters or fewer' }) }).optional().nullable(),
  meta_description: z.string().max(160, { error: t('admin.products.errors.metaDescriptionTooLong', { default: 'Meta description must be 160 characters or fewer' }) }).optional().nullable(),
  meta_title_pl: z.string().max(70, { error: t('admin.products.errors.metaTitleTooLong', { default: 'Meta title must be 70 characters or fewer' }) }).optional().nullable(),
  meta_description_pl: z.string().max(160, { error: t('admin.products.errors.metaDescriptionTooLong', { default: 'Meta description must be 160 characters or fewer' }) }).optional().nullable(),
})

const _price = (t: TranslateFunction) =>
  z.number({
    error: issue => issue.input === undefined
      ? t('admin.products.errors.priceRequired', { default: 'Price is required' })
      : t('admin.products.errors.priceInvalid', { default: 'Price must be a number' }),
  })
    .gt(0, { error: t('admin.products.errors.priceGtZero', { default: 'Price must be greater than zero' }) })
    .multipleOf(0.01, { error: t('admin.products.errors.priceCentPrecision', { default: 'Price can have at most two decimal places' }) })

export const createProductCreateSchema = (t: TranslateFunction) =>
  z.object({
    name: _string(t('admin.products.errors.nameRequired', { default: 'Name is required' }))
      .min(1, { error: t('admin.products.errors.nameRequired', { default: 'Name is required' }) })
      .max(200, { error: t('admin.products.errors.nameTooLong', { default: 'Name must be 200 characters or fewer' }) }),
    slug: _string(t('admin.products.errors.slugRequired', { default: 'Slug is required' }))
      .min(1, { error: t('admin.products.errors.slugRequired', { default: 'Slug is required' }) })
      .max(200, { error: t('admin.products.errors.slugTooLong', { default: 'Slug must be 200 characters or fewer' }) })
      .regex(SLUG_PATTERN, { error: t('admin.products.errors.slugFormat', { default: 'Slug must be lowercase letters, numbers, and hyphens' }) }),
    name_pl: z.string().max(200, { error: t('admin.products.errors.nameTooLong', { default: 'Name must be 200 characters or fewer' }) }).optional().nullable(),
    description: z.string().max(5000, { error: t('admin.products.errors.descriptionTooLong', { default: 'Description must be 5000 characters or fewer' }) }).optional().nullable(),
    description_pl: z.string().max(5000, { error: t('admin.products.errors.descriptionTooLong', { default: 'Description must be 5000 characters or fewer' }) }).optional().nullable(),
    sku: z.string().max(100, { error: t('admin.products.errors.skuTooLong', { default: 'SKU must be 100 characters or fewer' }) }).optional().nullable(),
    ..._merchantSeoFields(t),
    price_usd: _price(t).nullable().optional(),
    price_pln: _price(t).nullable().optional(),
    price_eur: _price(t).nullable().optional(),
    stock: z.number({
      error: issue => issue.input === undefined
        ? t('admin.products.errors.stockRequired', { default: 'Stock is required' })
        : t('admin.products.errors.stockInvalid', { default: 'Stock must be a number' }),
    })
      .int({ error: t('admin.products.errors.stockInteger', { default: 'Stock must be a whole number' }) })
      .min(0, { error: t('admin.products.errors.stockNegative', { default: 'Stock cannot be negative' }) })
      .default(0),
    weight_kg: z.number({
      error: t('admin.products.errors.weightInvalid', { default: 'Weight must be a number' }),
    })
      .nonnegative({ error: t('admin.products.errors.weightNegative', { default: 'Weight cannot be negative' }) })
      .nullable()
      .optional(),
    // Dimensions in cm — nullable + nonneg, mirroring weight_kg. The
    // backend convention is "all three set or none"; the order-create
    // resolver treats any-NULL as "no volumetric contribution" so a
    // half-populated row stays harmless. Drives volumetric weight pricing
    // alongside ShippingZone.dim_divisor.
    length_cm: z.number({
      error: t('admin.products.errors.dimensionInvalid', { default: 'Dimension must be a number' }),
    })
      .nonnegative({ error: t('admin.products.errors.dimensionNegative', { default: 'Dimension cannot be negative' }) })
      .nullable()
      .optional(),
    width_cm: z.number({
      error: t('admin.products.errors.dimensionInvalid', { default: 'Dimension must be a number' }),
    })
      .nonnegative({ error: t('admin.products.errors.dimensionNegative', { default: 'Dimension cannot be negative' }) })
      .nullable()
      .optional(),
    height_cm: z.number({
      error: t('admin.products.errors.dimensionInvalid', { default: 'Dimension must be a number' }),
    })
      .nonnegative({ error: t('admin.products.errors.dimensionNegative', { default: 'Dimension cannot be negative' }) })
      .nullable()
      .optional(),
    allow_backorder: z.boolean().default(false),
    is_active: z.boolean().default(true),
    is_featured: z.boolean().default(false),
    category_id: z.number().int().positive().optional().nullable(),
  }).superRefine((data, ctx) => {
    // At-least-one currency is the backend contract (CHECK constraint
    // ck_products_at_least_one_price). `== null` covers both null and
    // undefined — on create the form always sends all three (with `?? null`
    // for empty inputs), so this catches "user filled none".
    if (data.price_usd == null && data.price_pln == null && data.price_eur == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['price_pln'],
        message: t('admin.products.errors.atLeastOneCurrency', {
          default: 'At least one currency price is required',
        }),
      })
    }
  })

export const createProductUpdateSchema = (t: TranslateFunction) =>
  z.object({
    name: _string(t('admin.products.errors.nameRequired', { default: 'Name is required' }))
      .min(1, { error: t('admin.products.errors.nameRequired', { default: 'Name is required' }) })
      .max(200, { error: t('admin.products.errors.nameTooLong', { default: 'Name must be 200 characters or fewer' }) })
      .optional(),
    slug: _string(t('admin.products.errors.slugRequired', { default: 'Slug is required' }))
      .min(1, { error: t('admin.products.errors.slugRequired', { default: 'Slug is required' }) })
      .max(200, { error: t('admin.products.errors.slugTooLong', { default: 'Slug must be 200 characters or fewer' }) })
      .regex(SLUG_PATTERN, { error: t('admin.products.errors.slugFormat', { default: 'Slug must be lowercase letters, numbers, and hyphens' }) })
      .optional(),
    name_pl: z.string().max(200, { error: t('admin.products.errors.nameTooLong', { default: 'Name must be 200 characters or fewer' }) }).optional().nullable(),
    description: z.string().max(5000, { error: t('admin.products.errors.descriptionTooLong', { default: 'Description must be 5000 characters or fewer' }) }).optional().nullable(),
    description_pl: z.string().max(5000, { error: t('admin.products.errors.descriptionTooLong', { default: 'Description must be 5000 characters or fewer' }) }).optional().nullable(),
    sku: z.string().max(100, { error: t('admin.products.errors.skuTooLong', { default: 'SKU must be 100 characters or fewer' }) }).optional().nullable(),
    ..._merchantSeoFields(t),
    price_usd: _price(t).nullable().optional(),
    price_pln: _price(t).nullable().optional(),
    price_eur: _price(t).nullable().optional(),
    stock: z.number()
      .int({ error: t('admin.products.errors.stockInteger', { default: 'Stock must be a whole number' }) })
      .min(0, { error: t('admin.products.errors.stockNegative', { default: 'Stock cannot be negative' }) })
      .optional(),
    weight_kg: z.number({
      error: t('admin.products.errors.weightInvalid', { default: 'Weight must be a number' }),
    })
      .nonnegative({ error: t('admin.products.errors.weightNegative', { default: 'Weight cannot be negative' }) })
      .nullable()
      .optional(),
    length_cm: z.number({
      error: t('admin.products.errors.dimensionInvalid', { default: 'Dimension must be a number' }),
    })
      .nonnegative({ error: t('admin.products.errors.dimensionNegative', { default: 'Dimension cannot be negative' }) })
      .nullable()
      .optional(),
    width_cm: z.number({
      error: t('admin.products.errors.dimensionInvalid', { default: 'Dimension must be a number' }),
    })
      .nonnegative({ error: t('admin.products.errors.dimensionNegative', { default: 'Dimension cannot be negative' }) })
      .nullable()
      .optional(),
    height_cm: z.number({
      error: t('admin.products.errors.dimensionInvalid', { default: 'Dimension must be a number' }),
    })
      .nonnegative({ error: t('admin.products.errors.dimensionNegative', { default: 'Dimension cannot be negative' }) })
      .nullable()
      .optional(),
    allow_backorder: z.boolean().optional(),
    is_active: z.boolean().optional(),
    is_featured: z.boolean().optional(),
    category_id: z.number().int().positive().optional().nullable(),
  }).superRefine((data, ctx) => {
    // On update, distinguish "explicitly clear" from "leave alone": only
    // fail when ALL THREE are explicitly null (admin tried to wipe pricing).
    // Undefined means "don't touch" — a `{name: 'x'}` PATCH must succeed.
    if (data.price_usd === null && data.price_pln === null && data.price_eur === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['price_pln'],
        message: t('admin.products.errors.atLeastOneCurrency', {
          default: 'At least one currency price is required',
        }),
      })
    }
  })

export type ProductCreateInput = z.infer<ReturnType<typeof createProductCreateSchema>>
export type ProductUpdateInput = z.infer<ReturnType<typeof createProductUpdateSchema>>
