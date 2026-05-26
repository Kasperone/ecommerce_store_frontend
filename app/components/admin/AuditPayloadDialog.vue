<script setup lang="ts">
import type { AuditEventItem } from '#shared/types/api'

const props = defineProps<{
  open: boolean
  event: AuditEventItem | null
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { t } = useI18n()

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

// The AuditWriter records {after} on create, {before, after} on update (changed
// fields only), {before} on delete. Render whichever sides are present.
function side(key: 'before' | 'after'): Record<string, unknown> {
  const payload = props.event?.payload as Record<string, unknown> | undefined
  const value = payload?.[key]
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

const before = computed(() => side('before'))
const after = computed(() => side('after'))
const hasBefore = computed(() => Object.keys(before.value).length > 0)
const hasAfter = computed(() => Object.keys(after.value).length > 0)

const fieldKeys = computed(() =>
  [...new Set([...Object.keys(before.value), ...Object.keys(after.value)])].sort(),
)

function fmt(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="t('admin.auditLog.payload.title')"
  >
    <template #body>
      <div
        v-if="event"
        class="space-y-4"
      >
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted">
            {{ $t('admin.auditLog.fields.action') }}
          </dt>
          <dd>{{ $t(`admin.auditLog.actions.${event.action}`, event.action) }}</dd>
          <dt class="text-muted">
            {{ $t('admin.auditLog.fields.resource') }}
          </dt>
          <dd>
            {{ $t(`admin.auditLog.resources.${event.resource_type}`, event.resource_type) }}
            <span class="text-muted">#{{ event.resource_id ?? '—' }}</span>
          </dd>
          <dt class="text-muted">
            {{ $t('admin.auditLog.fields.actor') }}
          </dt>
          <dd>{{ event.actor_email ?? '—' }}</dd>
        </dl>

        <p
          v-if="fieldKeys.length === 0"
          class="text-muted text-sm"
        >
          {{ $t('admin.auditLog.payload.empty') }}
        </p>
        <table
          v-else
          class="w-full text-sm"
        >
          <thead>
            <tr class="text-left text-muted border-b border-default">
              <th class="py-1 pr-3 font-medium">
                {{ $t('admin.auditLog.payload.field') }}
              </th>
              <th
                v-if="hasBefore"
                class="py-1 pr-3 font-medium"
              >
                {{ $t('admin.auditLog.payload.before') }}
              </th>
              <th
                v-if="hasAfter"
                class="py-1 font-medium"
              >
                {{ $t('admin.auditLog.payload.after') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="key in fieldKeys"
              :key="key"
              class="border-b border-default/50 align-top"
            >
              <td class="py-1 pr-3 font-mono text-xs">
                {{ key }}
              </td>
              <td
                v-if="hasBefore"
                class="py-1 pr-3 break-all"
              >
                {{ fmt(before[key]) }}
              </td>
              <td
                v-if="hasAfter"
                class="py-1 break-all"
              >
                {{ fmt(after[key]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </UModal>
</template>
