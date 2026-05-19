/**
 * Zod validators for the admin categories form.
 *
 * Shape comes from the codegen'd `CategoryCreate` / `CategoryUpdate` in
 * `shared/types/api.ts` — these validators own constraints only.
 */

import { z } from 'zod'
import type { TranslateFunction } from './auth'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const _string = (msg: string) =>
  z.string({
    error: issue => issue.input === undefined ? msg : 'Invalid input',
  })

export const createCategoryCreateSchema = (t: TranslateFunction) =>
  z.object({
    name: _string(t('admin.categories.errors.nameRequired', { default: 'Name is required' }))
      .min(1, { error: t('admin.categories.errors.nameRequired', { default: 'Name is required' }) })
      .max(100, { error: t('admin.categories.errors.nameTooLong', { default: 'Name must be 100 characters or fewer' }) }),
    slug: _string(t('admin.categories.errors.slugRequired', { default: 'Slug is required' }))
      .min(1, { error: t('admin.categories.errors.slugRequired', { default: 'Slug is required' }) })
      .max(100, { error: t('admin.categories.errors.slugTooLong', { default: 'Slug must be 100 characters or fewer' }) })
      .regex(SLUG_PATTERN, { error: t('admin.categories.errors.slugFormat', { default: 'Slug must be lowercase letters, numbers, and hyphens' }) }),
    description: z.string().max(500, { error: t('admin.categories.errors.descriptionTooLong', { default: 'Description must be 500 characters or fewer' }) }).optional().nullable(),
    is_active: z.boolean().default(true),
  })

export const createCategoryUpdateSchema = (t: TranslateFunction) =>
  z.object({
    name: _string(t('admin.categories.errors.nameRequired', { default: 'Name is required' }))
      .min(1, { error: t('admin.categories.errors.nameRequired', { default: 'Name is required' }) })
      .max(100, { error: t('admin.categories.errors.nameTooLong', { default: 'Name must be 100 characters or fewer' }) })
      .optional(),
    slug: _string(t('admin.categories.errors.slugRequired', { default: 'Slug is required' }))
      .min(1, { error: t('admin.categories.errors.slugRequired', { default: 'Slug is required' }) })
      .max(100, { error: t('admin.categories.errors.slugTooLong', { default: 'Slug must be 100 characters or fewer' }) })
      .regex(SLUG_PATTERN, { error: t('admin.categories.errors.slugFormat', { default: 'Slug must be lowercase letters, numbers, and hyphens' }) })
      .optional(),
    description: z.string().max(500, { error: t('admin.categories.errors.descriptionTooLong', { default: 'Description must be 500 characters or fewer' }) }).optional().nullable(),
    is_active: z.boolean().optional(),
  })

export type CategoryCreateInput = z.infer<ReturnType<typeof createCategoryCreateSchema>>
export type CategoryUpdateInput = z.infer<ReturnType<typeof createCategoryUpdateSchema>>
