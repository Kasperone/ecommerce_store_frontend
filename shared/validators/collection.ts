/**
 * Zod validators for the admin collections form.
 *
 * Shape mirrors the codegen'd `CollectionCreate` / `CollectionUpdate` in
 * `shared/types/api.ts`. Collections are Category-shaped (per-locale name/slug/
 * description + SEO meta), so the constraints are identical to the category
 * validators — MINUS the smart-rules surface (`type`/`rules` are never authored
 * in v1). PL locale fields and SEO meta are all optional.
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
  const base = _string(t('admin.collections.errors.nameRequired', { default: 'Name is required' }))
    .max(100, { error: t('admin.collections.errors.nameTooLong', { default: 'Name must be 100 characters or fewer' }) })
  if (required) {
    return base.min(1, { error: t('admin.collections.errors.nameRequired', { default: 'Name is required' }) })
  }
  return base.optional().nullable()
}

function slugField(t: TranslateFunction, required: boolean) {
  const tooLong = {
    error: t('admin.collections.errors.slugTooLong', { default: 'Slug must be 100 characters or fewer' }),
  }
  const format = {
    error: t('admin.collections.errors.slugFormat', { default: 'Slug must be lowercase letters, numbers, and hyphens' }),
  }
  if (required) {
    return _string(t('admin.collections.errors.slugRequired', { default: 'Slug is required' }))
      .min(1, { error: t('admin.collections.errors.slugRequired', { default: 'Slug is required' }) })
      .max(100, tooLong)
      .regex(SLUG_PATTERN, format)
  }
  // Optional PL slug: "" means "not provided" (the page coerces "" → null on
  // submit). Apply the format check only when a value is present so the hidden
  // PL tab can't silently block submit.
  return z.string()
    .max(100, tooLong)
    .refine(v => v === '' || SLUG_PATTERN.test(v), format)
    .optional()
    .nullable()
}

function descriptionField(t: TranslateFunction) {
  return z.string()
    .max(500, { error: t('admin.collections.errors.descriptionTooLong', { default: 'Description must be 500 characters or fewer' }) })
    .optional()
    .nullable()
}

function metaTitleField(t: TranslateFunction) {
  return z.string()
    .max(META_TITLE_MAX, {
      error: t('admin.collections.errors.metaTitleTooLong', {
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
      error: t('admin.collections.errors.metaDescriptionTooLong', {
        max: META_DESCRIPTION_MAX,
        default: `Meta description must be ${META_DESCRIPTION_MAX} characters or fewer`,
      }),
    })
    .optional()
    .nullable()
}

function sortOrderField(t: TranslateFunction) {
  return z.number()
    .int({ error: t('admin.collections.errors.sortOrderInvalid', { default: 'Sort order must be a whole number' }) })
    .min(0, { error: t('admin.collections.errors.sortOrderInvalid', { default: 'Sort order must be a whole number' }) })
    .optional()
}

export const createCollectionCreateSchema = (t: TranslateFunction) =>
  z.object({
    name: nameField(t, true),
    slug: slugField(t, true),
    description: descriptionField(t),
    is_active: z.boolean().default(true),
    sort_order: sortOrderField(t),
    name_pl: nameField(t, false),
    slug_pl: slugField(t, false),
    description_pl: descriptionField(t),
    meta_title: metaTitleField(t),
    meta_description: metaDescriptionField(t),
    meta_title_pl: metaTitleField(t),
    meta_description_pl: metaDescriptionField(t),
  })

export const createCollectionUpdateSchema = (t: TranslateFunction) =>
  z.object({
    name: nameField(t, false),
    slug: slugField(t, false),
    description: descriptionField(t),
    is_active: z.boolean().optional(),
    sort_order: sortOrderField(t),
    name_pl: nameField(t, false),
    slug_pl: slugField(t, false),
    description_pl: descriptionField(t),
    meta_title: metaTitleField(t),
    meta_description: metaDescriptionField(t),
    meta_title_pl: metaTitleField(t),
    meta_description_pl: metaDescriptionField(t),
  })

export type CollectionCreateInput = z.infer<ReturnType<typeof createCollectionCreateSchema>>
export type CollectionUpdateInput = z.infer<ReturnType<typeof createCollectionUpdateSchema>>
