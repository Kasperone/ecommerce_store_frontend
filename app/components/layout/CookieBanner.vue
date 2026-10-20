<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const localePath = useLocalePath()

const {
  categories,
  hasDecided,
  isOpen,
  gpc,
  acceptAll,
  rejectAll,
  save,
  close,
} = useCookieConsent()

// The banner is visible until a decision is made, or whenever it's re-opened
// (footer "Cookie settings"). `hasDecided`/`isOpen` are shared module state.
const visible = computed(() => !hasDecided.value || isOpen.value)

// The category toggles ("Manage preferences") panel. Auto-expanded when there's
// already a decision (re-open path lands directly on the granular controls).
const showManage = ref(false)
watch(visible, (v) => {
  if (v && hasDecided.value) showManage.value = true
})

const analytics = computed({
  get: () => categories.value.analytics,
  set: (val: boolean) => { categories.value = { ...categories.value, analytics: val } },
})
const marketing = computed({
  get: () => categories.value.marketing,
  set: (val: boolean) => { categories.value = { ...categories.value, marketing: val } },
})

const cookiePolicyTo = computed(() => localePath('/cookie-policy'))
const privacyPolicyTo = computed(() => localePath('/privacy-policy'))

const dialogRef = ref<HTMLElement | null>(null)

// Focus management: move focus into the banner when it appears so keyboard +
// screen-reader users land on it. Respects the natural tab order afterwards.
watch(visible, async (v) => {
  if (!v) return
  await nextTick()
  dialogRef.value?.focus()
})

async function onAcceptAll() {
  await acceptAll()
  showManage.value = false
}
async function onRejectAll() {
  await rejectAll()
  showManage.value = false
}
async function onSave() {
  await save({ analytics: analytics.value, marketing: marketing.value })
  showManage.value = false
}

// ESC closes the banner — but only after a decision exists (you can't dismiss
// the first-visit consent prompt without choosing).
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && hasDecided.value) {
    event.stopPropagation()
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="dialogRef"
      class="cookie-banner fixed inset-x-0 bottom-0 z-50 border-t border-default bg-default shadow-lg focus:outline-none"
      role="dialog"
      aria-modal="false"
      :aria-label="t('cookies.banner.ariaLabel')"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <UContainer class="py-4 sm:py-5">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <h2 class="text-base font-semibold text-highlighted">
              {{ t('cookies.banner.heading') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('cookies.banner.description') }}
            </p>
            <p class="text-sm text-muted">
              <i18n-t
                keypath="cookies.banner.policyPrompt"
                tag="span"
                scope="global"
              >
                <template #policyLink>
                  <ULink
                    :to="cookiePolicyTo"
                    class="underline"
                  >
                    {{ t('cookies.banner.policyLink') }}
                  </ULink>
                </template>
                <template #privacyLink>
                  <ULink
                    :to="privacyPolicyTo"
                    class="underline"
                  >
                    {{ t('cookies.banner.privacyLink') }}
                  </ULink>
                </template>
              </i18n-t>
            </p>
            <p
              v-if="gpc"
              class="text-sm text-muted"
            >
              <UIcon
                name="i-lucide-shield-check"
                class="mr-1 inline-block align-text-bottom"
              />
              {{ t('cookies.banner.gpcNotice') }}
            </p>
          </div>

          <!-- Granular category controls (Manage preferences) -->
          <fieldset
            v-if="showManage"
            class="cookie-banner__panel flex flex-col gap-3 rounded-md border border-default p-4"
          >
            <legend class="px-1 text-sm font-semibold text-highlighted">
              {{ t('cookies.categories.heading') }}
            </legend>

            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ t('cookies.categories.necessary.label') }}
                </p>
                <p class="text-xs text-muted">
                  {{ t('cookies.categories.necessary.description') }}
                </p>
              </div>
              <span class="shrink-0 text-xs font-medium text-muted">
                {{ t('cookies.categories.necessary.alwaysOn') }}
              </span>
            </div>

            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ t('cookies.categories.analytics.label') }}
                </p>
                <p class="text-xs text-muted">
                  {{ t('cookies.categories.analytics.description') }}
                </p>
              </div>
              <USwitch
                v-model="analytics"
                class="shrink-0"
                :aria-label="t('cookies.categories.analytics.label')"
              />
            </div>

            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ t('cookies.categories.marketing.label') }}
                </p>
                <p class="text-xs text-muted">
                  {{ t('cookies.categories.marketing.description') }}
                </p>
              </div>
              <USwitch
                v-model="marketing"
                class="shrink-0"
                :aria-label="t('cookies.categories.marketing.label')"
              />
            </div>
          </fieldset>

          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <UButton
              v-if="!showManage"
              color="neutral"
              variant="ghost"
              class="justify-center"
              @click="() => { showManage = true }"
            >
              {{ t('cookies.banner.manage') }}
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              class="justify-center"
              @click="onRejectAll"
            >
              {{ t('cookies.banner.rejectAll') }}
            </UButton>
            <UButton
              v-if="showManage"
              color="neutral"
              variant="solid"
              class="justify-center"
              @click="onSave"
            >
              {{ t('cookies.banner.save') }}
            </UButton>
            <UButton
              color="primary"
              variant="solid"
              class="justify-center"
              @click="onAcceptAll"
            >
              {{ t('cookies.banner.acceptAll') }}
            </UButton>
          </div>
        </div>
      </UContainer>
    </div>
  </Teleport>
</template>

<style scoped>
.cookie-banner {
  animation: cookie-banner-in 200ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .cookie-banner {
    animation: none;
  }
}

@keyframes cookie-banner-in {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
