import { describe, expect, it } from 'vitest'
import {
  createBusinessSignUpSchema,
  createEmailValidation,
  createForgotPasswordSchema,
  createLoginSchema,
  createNameValidation,
  createPasswordValidation,
  createPersonalSignUpSchema,
  createResetPasswordSchema,
} from './auth'
import { tStub } from '../../test/helpers/i18nStub'

const validPersonalPayload = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  password: 'Sup3rSecret!',
  confirmPassword: 'Sup3rSecret!',
  shippingStreet: null,
  shippingCity: null,
  shippingPostalCode: null,
  shippingCountry: null,
  shippingState: null,
}

const validBusinessPayload = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  password: 'Sup3rSecret!',
  confirmPassword: 'Sup3rSecret!',
  companyName: 'Analytical Engine Co',
  companyTaxId: null,
  companyAddressStreet: null,
  companyAddressCity: null,
  companyAddressPostalCode: null,
  companyAddressCountry: null,
  companyAddressState: null,
}

describe('createEmailValidation', () => {
  const schema = createEmailValidation('Invalid email')

  it.each([
    'user@example.com',
    'firstname.lastname@example.co.uk',
    'a+tag@sub.example.com',
  ])('accepts valid email %s', (email) => {
    expect(schema.safeParse(email).success).toBe(true)
  })

  it.each([
    'plain',
    '@nouser.com',
    'user@',
    'user@@double.com',
    '',
  ])('rejects invalid email %s', (email) => {
    expect(schema.safeParse(email).success).toBe(false)
  })

  it('uses the provided error message', () => {
    const result = schema.safeParse('not-an-email')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Invalid email')
    }
  })
})

describe('createPasswordValidation', () => {
  const schema = createPasswordValidation(8, 'Too short')

  it('accepts 8+ char password', () => {
    expect(schema.safeParse('12345678').success).toBe(true)
  })

  it('rejects shorter passwords with the configured message', () => {
    const result = schema.safeParse('1234567')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Too short')
    }
  })

  it('rejects passwords longer than 100 chars', () => {
    const result = schema.safeParse('a'.repeat(101))
    expect(result.success).toBe(false)
  })

  it('caps acceptance at exactly 100 chars', () => {
    expect(schema.safeParse('a'.repeat(100)).success).toBe(true)
  })

  it('rejects undefined input as required', () => {
    const result = schema.safeParse(undefined)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Password is required')
    }
  })
})

describe('createNameValidation', () => {
  const schema = createNameValidation(1, 'Required')

  it('accepts a single character', () => {
    expect(schema.safeParse('A').success).toBe(true)
  })

  it('rejects empty string with configured message', () => {
    const result = schema.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Required')
    }
  })

  it('rejects undefined with configured message', () => {
    const result = schema.safeParse(undefined)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Required')
    }
  })
})

describe('createLoginSchema', () => {
  const schema = createLoginSchema(tStub)

  it('accepts a well-formed login payload', () => {
    expect(
      schema.safeParse({
        email: 'user@example.com',
        password: 'password1',
        remember: true,
      }).success,
    ).toBe(true)
  })

  it('treats `remember` as optional', () => {
    expect(
      schema.safeParse({ email: 'user@example.com', password: 'password1' })
        .success,
    ).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = schema.safeParse({
      email: 'not-an-email',
      password: 'password1',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map(i => i.path[0])
      expect(fields).toContain('email')
    }
  })

  it('rejects a too-short password', () => {
    const result = schema.safeParse({
      email: 'user@example.com',
      password: 'short',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map(i => i.path[0])
      expect(fields).toContain('password')
    }
  })
})

describe('createPersonalSignUpSchema', () => {
  const schema = createPersonalSignUpSchema(tStub)

  it('accepts a valid payload', () => {
    expect(schema.safeParse(validPersonalPayload).success).toBe(true)
  })

  it('rejects mismatched password / confirmPassword on the confirmPassword path', () => {
    const result = schema.safeParse({
      ...validPersonalPayload,
      confirmPassword: 'different-password',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        i => i.path[0] === 'confirmPassword',
      )
      expect(issue).toBeDefined()
      expect(issue?.message).toBe('Passwords do not match')
    }
  })

  it('aggregates all required-field errors when sent empty', () => {
    const result = schema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = new Set(result.error.issues.map(i => i.path[0]))
      expect(fields.has('firstName')).toBe(true)
      expect(fields.has('lastName')).toBe(true)
      expect(fields.has('email')).toBe(true)
      expect(fields.has('password')).toBe(true)
      expect(fields.has('confirmPassword')).toBe(true)
    }
  })
})

describe('createBusinessSignUpSchema', () => {
  const schema = createBusinessSignUpSchema(tStub)

  it('accepts a valid payload', () => {
    expect(schema.safeParse(validBusinessPayload).success).toBe(true)
  })

  it('rejects when companyName is missing', () => {
    const result = schema.safeParse({
      ...validBusinessPayload,
      companyName: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path[0] === 'companyName')
      expect(issue).toBeDefined()
      expect(issue?.message).toBe('Company name is required')
    }
  })

  it('rejects mismatched passwords on the confirmPassword path', () => {
    const result = schema.safeParse({
      ...validBusinessPayload,
      confirmPassword: 'mismatch',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        i => i.path[0] === 'confirmPassword',
      )
      expect(issue).toBeDefined()
      expect(issue?.message).toBe('Passwords do not match')
    }
  })
})

describe('createForgotPasswordSchema', () => {
  const schema = createForgotPasswordSchema(tStub)

  it('accepts a valid email', () => {
    expect(schema.safeParse({ email: 'a@b.com' }).success).toBe(true)
  })

  it('rejects an invalid email', () => {
    expect(schema.safeParse({ email: 'invalid' }).success).toBe(false)
  })
})

describe('createResetPasswordSchema', () => {
  const schema = createResetPasswordSchema(tStub)

  const valid = {
    password: 'Sup3rSecret!',
    confirmPassword: 'Sup3rSecret!',
  }

  it('accepts a valid payload', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it('does not require a token key — URL param consumed by the page, not the form', () => {
    // UAuthForm rebuilds its validation state from the :fields prop, so any
    // schema key without a matching field is dropped before Zod runs. A `token`
    // requirement here would fail silently with no field to render the error.
    expect(schema.safeParse(valid).success).toBe(true)
    // And an incidentally-passed token key is harmless — Zod strips unknowns.
    expect(schema.safeParse({ ...valid, token: '' }).success).toBe(true)
  })

  it('rejects when passwords differ on the confirmPassword path', () => {
    const result = schema.safeParse({ ...valid, confirmPassword: 'nope' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        i => i.path[0] === 'confirmPassword',
      )
      expect(issue).toBeDefined()
      // Note: this schema uses the apostrophe variant of the default copy
      // ("don't match"), unlike the sign-up schemas ("do not match"). The
      // i18n translation key is the same and tests both via tStub fallback.
      expect(issue?.message).toBe('Passwords don\'t match')
    }
  })
})
