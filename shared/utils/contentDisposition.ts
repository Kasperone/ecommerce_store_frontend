/**
 * Read the server-chosen download filename out of a `Content-Disposition`
 * header.
 *
 * The backend names every download deliberately — a faktura carries its legal
 * invoice number, a quote its quote number, a CSV its applied filters — so the
 * server name is the one that should reach the user's filesystem. Callers keep
 * a local fallback for when the header is absent or unparseable.
 *
 * NOTE: the browser can only read this header because the API explicitly lists
 * it in the CORS `expose_headers` allowlist (backend #226). Without that it is
 * invisible to `fetch` on a cross-origin response and this always returns
 * `null` — which is exactly how it silently went unnoticed before.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const match = /filename="?([^";]+)"?/i.exec(header)
  if (!match || !match[1]) return null
  return match[1]
}
