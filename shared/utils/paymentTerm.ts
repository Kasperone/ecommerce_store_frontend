/**
 * Buyer/admin-facing helpers for B2B payment terms (net-terms tail Program A).
 *
 * A payment term is a named net-terms template with one of three shapes:
 * `net_days` (due = order date + N), `due_on_receipt` (due = order date), or
 * `fixed_date` (due = a calendar deadline). These helpers turn a term into an
 * i18n key + interpolation params so both the checkout option and the company
 * portal render a consistent "when is this due" line without duplicating the
 * type switch. `t` is passed in (utils can't auto-import the composable).
 */

import type { components } from '#shared/types/api.gen'

export type PaymentTerm = components['schemas']['PaymentTermResponse']

type TFn = (key: string, named?: Record<string, unknown>) => string

/** A short "due …" description for a term, localized (empty string if no term). */
export function describeTermDue(term: PaymentTerm | null | undefined, t: TFn, locale = 'en'): string {
  if (!term) return ''
  switch (term.term_type) {
    case 'net_days':
      return t('paymentTerms.due.netDays', { days: term.net_days ?? 0 })
    case 'due_on_receipt':
      return t('paymentTerms.due.onReceipt')
    case 'fixed_date':
      return t('paymentTerms.due.fixedDate', { date: formatTermDate(term.due_date, locale) })
    default:
      return ''
  }
}

/** Format a term's `due_date` (ISO `YYYY-MM-DD`) for display; passthrough on parse failure. */
export function formatTermDate(due: string | null | undefined, locale = 'en'): string {
  if (!due) return ''
  const d = new Date(due)
  if (Number.isNaN(d.getTime())) return due
  return d.toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
