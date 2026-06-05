import { describe, expect, it } from 'vitest'
import { createContactSchema } from './contact'

// Identity translate stub: returns options.default when present, else the key.
const t = (key: string, options?: Record<string, unknown>) =>
  (options?.default as string | undefined) ?? key

const schema = createContactSchema(t)

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  subject: 'A question',
  message: 'Hello there.',
}

describe('createContactSchema', () => {
  it('accepts a well-formed submission', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it.each(['name', 'subject', 'message'] as const)('rejects an empty %s', (field) => {
    const result = schema.safeParse({ ...valid, [field]: '   ' })
    expect(result.success).toBe(false)
  })

  it('rejects a missing email', () => {
    expect(schema.safeParse({ ...valid, email: '' }).success).toBe(false)
  })

  it('rejects an invalid email', () => {
    expect(schema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
  })

  it('rejects a name longer than 100 chars', () => {
    expect(schema.safeParse({ ...valid, name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('rejects a subject longer than 200 chars', () => {
    expect(schema.safeParse({ ...valid, subject: 'a'.repeat(201) }).success).toBe(false)
  })

  it('rejects a message longer than 5000 chars', () => {
    expect(schema.safeParse({ ...valid, message: 'a'.repeat(5001) }).success).toBe(false)
  })

  it('trims string fields', () => {
    const result = schema.safeParse({ ...valid, name: '  Ada  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe('Ada')
  })
})
