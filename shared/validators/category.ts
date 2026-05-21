/**
 * Zod validators for the admin categories form.
 *
 * Shape comes from the codegen'd `CategoryCreate` / `CategoryUpdate` in
 * `shared/types/api.ts` — these validators own constraints only. PL locale
 * fields and SEO meta are all optional (admins fill them in incrementally).
 */

import { z } from 'zod'
import type { TranslateFunction } from './auth'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const META_TITLE_MAX = 70
const META_DESCRIPTION_MAX = 160

const _string = (msg: string) =>
  z.string({
    error: issue => issue.input === undefined ? msg : 'Invalid input',
  })

function nameField(t: TranslateFunction, required: boolean) {
  const base = _string(t('admin.categories.errors.nameRequired', { default: 'Name is required' }))
    .max(100, { error: t('admin.categories.errors.nameTooLong', { default: 'Name must be 100 characters or fewer' }) })
  if (required) {
    return base.min(1, { error: t('admin.categories.errors.nameRequired', { default: 'Name is required' }) })
  }
  // Optional locale name — accept empty string and treat as null at submit.
  return base.optional().nullable()
}

function slugField(t: TranslateFunction, required: boolean) {
  const base = _string(t('admin.categories.errors.slugRequired', { default: 'Slug is required' }))
    .max(100, { error: t('admin.categories.errors.slugTooLong', { default: 'Slug must be 100 characters or fewer' }) })
    .regex(SLUG_PATTERN, { error: t('admin.categories.errors.slugFormat', { default: 'Slug must be lowercase letters, numbers, and hyphens' }) })
  if (required) {
    return base.min(1, { error: t('admin.categories.errors.slugRequired', { default: 'Slug is required' }) })
  }
  return base.optional().nullable()
}

function descriptionField(t: TranslateFunction) {
  return z.string()
    .max(500, { error: t('admin.categories.errors.descriptionTooLong', { default: 'Description must be 500 characters or fewer' }) })
    .optional()
    .nullable()
}

function metaTitleField(t: TranslateFunction) {
  return z.string()
    .max(META_TITLE_MAX, {
      error: t('admin.categories.errors.metaTitleTooLong', {
        max: META_TITLE_MAX,
        default: `Meta title must be ${META_TITLE_MAX} characters or fewer`,
      }),
    })
    .optional()
    .nullable()
}

function metaDescriptionField(t: TranslateFunction) {
  return z.string()
    .max(META_DESCRIPTION_MAX, {
      error: t('admin.categories.errors.metaDescriptionTooLong', {
        max: META_DESCRIPTION_MAX,
        default: `Meta description must be ${META_DESCRIPTION_MAX} characters or fewer`,
      }),
    })
    .optional()
    .nullable()
}

export const createCategoryCreateSchema = (t: TranslateFunction) =>
  z.object({
    name: nameField(t, true),
    slug: slugField(t, true),
    description: descriptionField(t),
    is_active: z.boolean().default(true),
    name_pl: nameField(t, false),
    slug_pl: slugField(t, false),
    description_pl: descriptionField(t),
    meta_title: metaTitleField(t),
    meta_description: metaDescriptionField(t),
    meta_title_pl: metaTitleField(t),
    meta_description_pl: metaDescriptionField(t),
  })

export const createCategoryUpdateSchema = (t: TranslateFunction) =>
  z.object({
    name: nameField(t, false),
    slug: slugField(t, false),
    description: descriptionField(t),
    is_active: z.boolean().optional(),
    name_pl: nameField(t, false),
    slug_pl: slugField(t, false),
    description_pl: descriptionField(t),
    meta_title: metaTitleField(t),
    meta_description: metaDescriptionField(t),
    meta_title_pl: metaTitleField(t),
    meta_description_pl: metaDescriptionField(t),
  })

export type CategoryCreateInput = z.infer<ReturnType<typeof createCategoryCreateSchema>>
export type CategoryUpdateInput = z.infer<ReturnType<typeof createCategoryUpdateSchema>>
