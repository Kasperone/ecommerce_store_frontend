export function safeRedirect(target: unknown, fallback: string): string {
  if (typeof target !== 'string' || target.length === 0) return fallback
  if (target.startsWith('//')) return fallback
  if (!target.startsWith('/')) return fallback
  if (target.includes('://')) return fallback
  return target
}
