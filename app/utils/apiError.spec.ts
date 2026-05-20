import { describe, expect, it } from 'vitest'
import { normalizeApiError } from './apiError'

const FALLBACK = 'Login failed. Please check your credentials.'

describe('normalizeApiError', () => {
  it('returns the FastAPI string detail when present', () => {
    const fastApi401 = {
      status: 401,
      data: { detail: 'Incorrect email or password' },
    }
    const result = normalizeApiError(fastApi401, FALLBACK)
    expect(result.message).toBe('Incorrect email or password')
    expect(result.fieldErrors).toEqual({})
  })

  it('extracts per-field errors from a FastAPI 422 detail array', () => {
    const fastApi422 = {
      status: 422,
      data: {
        detail: [
          { loc: ['body', 'username'], msg: 'value is not a valid email', type: 'value_error.email' },
          { loc: ['body', 'password'], msg: 'ensure this value has at least 8 characters', type: 'value_error.any_str.min_length' },
        ],
      },
    }
    const result = normalizeApiError(fastApi422, FALLBACK)
    expect(result.message).toBe('value is not a valid email')
    expect(result.fieldErrors).toEqual({
      // `username` is mapped to `email` via SNAKE_TO_CAMEL_FIELDS.
      email: 'value is not a valid email',
      password: 'ensure this value has at least 8 characters',
    })
  })

  it('falls back to the caller-supplied message for 502 Bad Gateway (no FastAPI detail)', () => {
    // h3 proxy response shape when the backend is down. ofetch's error.message
    // would otherwise be `[POST] "/api/v1/auth/login": 502 Bad Gateway`, which
    // leaks the method+URL into the user-facing alert. We deliberately ignore
    // error.message so the form-supplied fallback wins.
    const h3GatewayError = {
      status: 502,
      data: {
        error: true,
        url: 'http://localhost:3000/api/v1/auth/login',
        statusCode: 502,
        statusMessage: 'Bad Gateway',
        message: 'Bad Gateway',
      },
      message: '[POST] "/api/v1/auth/login": 502 Bad Gateway',
    }
    const result = normalizeApiError(h3GatewayError, FALLBACK)
    expect(result.message).toBe(FALLBACK)
    // Crucial: nothing that looks like a stack-trace-y URL leaks through.
    expect(result.message).not.toContain('/api/v1/')
    expect(result.message).not.toContain('POST')
    expect(result.fieldErrors).toEqual({})
  })

  it('falls back when the error is a plain JS Error (network failure, etc.)', () => {
    const networkErr = new TypeError('Failed to fetch')
    const result = normalizeApiError(networkErr, FALLBACK)
    expect(result.message).toBe(FALLBACK)
  })

  it('falls back when the error is null / undefined / not an object', () => {
    expect(normalizeApiError(null, FALLBACK).message).toBe(FALLBACK)
    expect(normalizeApiError(undefined, FALLBACK).message).toBe(FALLBACK)
    expect(normalizeApiError('boom', FALLBACK).message).toBe(FALLBACK)
  })

  it('falls back when detail is the empty string or whitespace', () => {
    expect(normalizeApiError({ data: { detail: '' } }, FALLBACK).message).toBe(FALLBACK)
    expect(normalizeApiError({ data: { detail: '   ' } }, FALLBACK).message).toBe(FALLBACK)
  })
})
