// Browsers strip \t \n \r from URLs before parsing, so a value like
// `java\tscript:` would otherwise defeat the `://` check below. Reject any
// control character (< 0x20) or DEL (0x7f) outright.
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

export function safeRedirect(target: unknown, fallback: string): string {
  if (typeof target !== 'string' || target.length === 0) return fallback

  // Decode percent-encoding (best-effort) so an encoded control char (`%09`)
  // or backslash (`%5C`) is caught by the checks below. Malformed input rejects.
  let decoded: string
  try {
    decoded = decodeURIComponent(target)
  }
  catch {
    return fallback
  }

  if (hasControlChar(target) || hasControlChar(decoded)) return fallback
  // Browsers normalize backslashes to `/`, so `/\evil.com` becomes the
  // protocol-relative `//evil.com` -> external redirect. Reject in either form.
  if (target.includes('\\') || decoded.includes('\\')) return fallback
  if (target.startsWith('//')) return fallback
  if (!target.startsWith('/')) return fallback
  if (target.includes('://') || decoded.includes('://')) return fallback

  return target
}
