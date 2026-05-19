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
    description: z.string().max(5000, { error: t('admin.products.errors.descriptionTooLong', { default: 'Description must be 5000 characters or fewer' }) }).optional().nullable(),
    sku: z.string().max(100, { error: t('admin.products.errors.skuTooLong', { default: 'SKU must be 100 characters or fewer' }) }).optional().nullable(),
    price_usd: _price(t),
    price_pln: _price(t),
    price_eur: _price(t),
    stock: z.number({
      error: issue => issue.input === undefined
        ? t('admin.products.errors.stockRequired', { default: 'Stock is required' })
        : t('admin.products.errors.stockInvalid', { default: 'Stock must be a number' }),
    })
      .int({ error: t('admin.products.errors.stockInteger', { default: 'Stock must be a whole number' }) })
      .min(0, { error: t('admin.products.errors.stockNegative', { default: 'Stock cannot be negative' }) })
      .default(0),
    is_active: z.boolean().default(true),
    is_featured: z.boolean().default(false),
    category_id: z.number().int().positive().optional().nullable(),
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
    description: z.string().max(5000, { error: t('admin.products.errors.descriptionTooLong', { default: 'Description must be 5000 characters or fewer' }) }).optional().nullable(),
    sku: z.string().max(100, { error: t('admin.products.errors.skuTooLong', { default: 'SKU must be 100 characters or fewer' }) }).optional().nullable(),
    price_usd: _price(t).optional(),
    price_pln: _price(t).optional(),
    price_eur: _price(t).optional(),
    stock: z.number()
      .int({ error: t('admin.products.errors.stockInteger', { default: 'Stock must be a whole number' }) })
      .min(0, { error: t('admin.products.errors.stockNegative', { default: 'Stock cannot be negative' }) })
      .optional(),
    is_active: z.boolean().optional(),
    is_featured: z.boolean().optional(),
    category_id: z.number().int().positive().optional().nullable(),
  })

export type ProductCreateInput = z.infer<ReturnType<typeof createProductCreateSchema>>
export type ProductUpdateInput = z.infer<ReturnType<typeof createProductUpdateSchema>>
