/**
 * Zod validator for the storefront "write a review" form.
 *
 * Field constraints mirror the backend `ReviewCreate` (`app/schemas/review.py`):
 * rating 1-5 (required), title optional (≤200), body 10-5000. The backend
 * re-validates on the wire.
 */

import { z } from 'zod'
import type { TranslateFunction } from './auth'

export const createReviewSchema = (t: TranslateFunction) =>
  z.object({
    rating: z
      .number({
        error: issue =>
          issue.input === undefined
            ? t('reviews.form.errors.ratingRequired', { default: 'Please select a rating' })
            : 'Invalid input',
      })
      .int()
      .min(1, { error: t('reviews.form.errors.ratingRequired', { default: 'Please select a rating' }) })
      .max(5, { error: t('reviews.form.errors.ratingRange', { default: 'Rating must be between 1 and 5' }) }),
    title: z
      .string()
      .max(200, { error: t('reviews.form.errors.titleTooLong', { default: 'Title must be 200 characters or fewer' }) })
      .optional(),
    body: z
      .string({
        error: issue =>
          issue.input === undefined
            ? t('reviews.form.errors.bodyRequired', { default: 'Please write your review' })
            : 'Invalid input',
      })
      .min(10, { error: t('reviews.form.errors.bodyTooShort', { default: 'Review must be at least 10 characters' }) })
      .max(5000, { error: t('reviews.form.errors.bodyTooLong', { default: 'Review must be 5000 characters or fewer' }) }),
  })

export type ReviewInput = z.infer<ReturnType<typeof createReviewSchema>>
