/**
 * Device-preview frame widths for the CMS editor preview surfaces.
 *
 * Shared by the `DevicePreview.vue` toggle and the editor page that applies the
 * selected width to its preview/canvas frame. Kept out of the `.vue` SFC because
 * `<script setup>` cannot carry ES module exports.
 */

export type DeviceMode = 'desktop' | 'tablet' | 'mobile'

/**
 * Frame max-width per device, in CSS px. `null` = full width (desktop, the
 * current behavior). Tablet/mobile use common viewport widths so the preview
 * matches real device sizes.
 */
export const DEVICE_WIDTHS: Record<DeviceMode, number | null> = {
  desktop: null,
  tablet: 768,
  mobile: 375,
}
