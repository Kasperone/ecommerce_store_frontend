export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const IMAGE_ACCEPT_ATTR = ALLOWED_IMAGE_TYPES.join(',')

export function isAllowedImageType(mime: string): mime is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)
}
