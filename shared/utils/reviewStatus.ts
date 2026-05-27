/**
 * Review moderation-status presentation helpers.
 *
 * The backend (`app/models/review.py::ReviewStatus`) is the source of truth;
 * this drives badge colours and the set of statuses the admin UI filters and
 * moderates by. Only `approved` reviews are public.
 */

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected']

type BadgeColor = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'error'

const STATUS_COLORS: Record<ReviewStatus, BadgeColor> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}

export function reviewStatusColor(status: ReviewStatus | string): BadgeColor {
  return STATUS_COLORS[status as ReviewStatus] ?? 'neutral'
}
