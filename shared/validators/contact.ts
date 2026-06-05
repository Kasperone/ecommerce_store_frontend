/**
 * Zod validator for the public contact form (`app/pages/contact/index.vue`).
 *
 * Field constraints mirror the backend `ContactRequest`
 * (`app/schemas/contact.py`): name (required, ≤100), email (required, valid),
 * subject (required, ≤200), message (required, ≤5000). The backend
 * re-validates on the wire.
 */

import { z } from 'zod'
import type { TranslateFunction } from './auth'

const _required = (t: TranslateFunction, key: string, def: string) =>
  z.string({
    error: issue => issue.input === undefined ? t(key, { default: def }) : 'Invalid input',
  }).trim().min(1, { error: t(key, { default: def }) })

export const createContactSchema = (t: TranslateFunction) =>
  z.object({
    name: _required(t, 'legal.contact.form.errors.nameRequired', 'Please enter your name')
      .max(100, { error: t('legal.contact.form.errors.nameTooLong', { default: 'Name must be 100 characters or fewer' }) }),
    email: z.email({
      error: (issue) => {
        const value = issue.input
        if (typeof value !== 'string' || value.trim() === '') {
          return t('legal.contact.form.errors.emailRequired', { default: 'Please enter your email address' })
        }
        return t('legal.contact.form.errors.emailInvalid', { default: 'Please enter a valid email address' })
      },
    }),
    subject: _required(t, 'legal.contact.form.errors.subjectRequired', 'Please enter a subject')
      .max(200, { error: t('legal.contact.form.errors.subjectTooLong', { default: 'Subject must be 200 characters or fewer' }) }),
    message: _required(t, 'legal.contact.form.errors.messageRequired', 'Please enter a message')
      .max(5000, { error: t('legal.contact.form.errors.messageTooLong', { default: 'Message must be 5000 characters or fewer' }) }),
  })

export type ContactFormData = z.infer<ReturnType<typeof createContactSchema>>
