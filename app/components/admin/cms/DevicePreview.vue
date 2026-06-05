<script setup lang="ts">
/**
 * Device-preview width toggle (Desktop / Tablet / Mobile) for the CMS editor
 * preview surfaces.
 *
 * It is a thin segmented control over a `v-model` device string. The consumer
 * maps the selected device to a frame width (`DEVICE_WIDTHS` in
 * `./devicePreview.ts`) and centers the preview frame so full-bleed blocks
 * render at a realistic responsive width instead of overflowing the pane.
 */
import type { DeviceMode } from '~/utils/devicePreview'

const model = defineModel<DeviceMode>({ required: true })

const { t } = useI18n()

const items = computed(() => [
  { label: t('admin.cms.device.desktop'), value: 'desktop' as const, icon: 'i-lucide-monitor' },
  { label: t('admin.cms.device.tablet'), value: 'tablet' as const, icon: 'i-lucide-tablet' },
  { label: t('admin.cms.device.mobile'), value: 'mobile' as const, icon: 'i-lucide-smartphone' },
])
</script>

<template>
  <UTabs
    v-model="model"
    :items="items"
    :content="false"
    size="xs"
    color="primary"
    :aria-label="t('admin.cms.device.label')"
    data-testid="device-preview-toggle"
  />
</template>
