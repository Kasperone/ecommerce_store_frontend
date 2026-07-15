<script setup lang="ts">
import type { OrderEventResponse } from '~/composables/queries/useOrderEventQueries'

const props = defineProps<{
  orderId: number
}>()

const { t, locale } = useI18n()
const toast = useToast()
const auth = useAuthStore()

const orderIdRef = computed(() => props.orderId)
const { data: events, isLoading, error } = useOrderEventsQuery(orderIdRef)
const timeline = computed<OrderEventResponse[]>(() => events.value ?? [])

const canComment = computed(() => auth.can('orders:write'))

// Per-kind icon + color. Unknown kinds fall back to a neutral dot.
const KIND_META: Record<string, { icon: string, color: string }> = {
  created: { icon: 'i-lucide-plus-circle', color: 'text-primary' },
  paid: { icon: 'i-lucide-badge-check', color: 'text-success' },
  status_changed: { icon: 'i-lucide-arrow-right-circle', color: 'text-info' },
  tracking_added: { icon: 'i-lucide-truck', color: 'text-info' },
  refunded: { icon: 'i-lucide-undo-2', color: 'text-warning' },
  edited: { icon: 'i-lucide-pencil', color: 'text-info' },
  note: { icon: 'i-lucide-message-square', color: 'text-muted' },
}

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { icon: 'i-lucide-circle', color: 'text-muted' }
}

const dateFmt = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }),
)
function formatWhen(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.value.format(d)
}

function actorName(ev: OrderEventResponse) {
  if (!ev.actor) return t('admin.orders.timeline.system')
  const full = `${ev.actor.first_name} ${ev.actor.last_name}`.trim()
  return full || ev.actor.email
}

// One-line label per event from kind + payload. Comments render their free text.
function eventLabel(ev: OrderEventResponse): string {
  const p = (ev.payload ?? {}) as Record<string, unknown>
  switch (ev.kind) {
    case 'created':
      return t('admin.orders.timeline.kinds.created')
    case 'paid':
      return t('admin.orders.timeline.kinds.paid')
    case 'status_changed':
      return t('admin.orders.timeline.kinds.statusChanged', {
        from: String(p.from ?? ''),
        to: String(p.to ?? ''),
      })
    case 'tracking_added':
      return t('admin.orders.timeline.kinds.trackingAdded', {
        tracking: String(p.tracking_number ?? ''),
      })
    case 'refunded':
      return t('admin.orders.timeline.kinds.refunded', { amount: String(p.amount ?? '') })
    case 'edited':
      return t('admin.orders.timeline.kinds.edited')
    case 'note':
      return ev.comment ?? ''
    default:
      return ev.kind
  }
}

// Comment box.
const addComment = useAddOrderComment()
const comment = ref('')
const submitting = computed(() => addComment.isLoading.value)

async function onSubmitComment() {
  const text = comment.value.trim()
  if (!text) return
  try {
    await addComment.mutateAsync({ orderId: props.orderId, comment: text })
    comment.value = ''
  }
  catch {
    toast.add({
      title: t('admin.orders.timeline.commentError'),
      color: 'error',
      icon: 'i-lucide-alert-triangle',
    })
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        {{ $t('admin.orders.timeline.title') }}
      </h2>
    </template>

    <!-- Comment box (orders:write only). -->
    <div
      v-if="canComment"
      class="flex items-start gap-2 mb-4"
    >
      <UTextarea
        v-model="comment"
        :rows="2"
        autoresize
        class="flex-1"
        :placeholder="$t('admin.orders.timeline.commentPlaceholder')"
        data-testid="order-comment-input"
      />
      <UButton
        icon="i-lucide-send"
        :loading="submitting"
        :disabled="!comment.trim()"
        data-testid="order-comment-submit"
        @click="onSubmitComment"
      >
        {{ $t('admin.orders.timeline.comment') }}
      </UButton>
    </div>

    <div
      v-if="isLoading"
      class="text-muted text-sm py-4"
    >
      {{ $t('admin.orders.timeline.loading') }}
    </div>
    <div
      v-else-if="error"
      class="text-error text-sm py-4"
    >
      {{ $t('admin.orders.timeline.loadError') }}
    </div>
    <div
      v-else-if="timeline.length === 0"
      class="text-muted text-sm py-4"
    >
      {{ $t('admin.orders.timeline.empty') }}
    </div>

    <ol
      v-else
      class="space-y-4"
    >
      <li
        v-for="ev in timeline"
        :key="ev.id"
        class="flex gap-3"
      >
        <UIcon
          :name="kindMeta(ev.kind).icon"
          class="size-5 shrink-0 mt-0.5"
          :class="kindMeta(ev.kind).color"
        />
        <div class="min-w-0">
          <p
            class="text-sm"
            :class="ev.kind === 'note' ? 'whitespace-pre-wrap' : ''"
          >
            {{ eventLabel(ev) }}
          </p>
          <p class="text-xs text-muted mt-0.5">
            {{ actorName(ev) }} · {{ formatWhen(ev.created_at) }}
          </p>
        </div>
      </li>
    </ol>
  </UCard>
</template>
