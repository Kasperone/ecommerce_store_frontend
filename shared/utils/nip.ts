/**
 * Polish NIP (tax id) validation — mirrors the backend `app/core/validators.py`
 * so a typo'd NIP is caught client-side before the checkout POST (the backend
 * re-validates and 422s regardless).
 *
 * A NIP is 10 digits with a weighted mod-11 checksum.
 */

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7]

/** Strip everything but digits (NIPs are written `123-456-32-18`, `PL1234563218`, …). */
export function normalizeNip(nip: string): string {
  return nip.replace(/\D/g, '')
}

/** True if `nip` is a structurally valid Polish NIP (10 digits + checksum). */
export function isValidNip(nip: string): boolean {
  const digits = normalizeNip(nip)
  if (digits.length !== 10) return false
  const sum = NIP_WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0)
  const check = sum % 11
  // A remainder of 10 can never be a valid NIP check digit.
  if (check === 10) return false
  return check === Number(digits[9])
}
