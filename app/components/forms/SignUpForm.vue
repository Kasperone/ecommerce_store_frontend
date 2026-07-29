<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const localePath = useLocalePath()

// Plain ref bound straight to `<UTabs v-model>` — the proven pattern.
const activeTab = ref<'personal' | 'business'>('personal')

const tabItems = computed(() => {
  // ensure computed re-runs when locale changes
  void locale.value
  return [
    {
      label: t('auth.personal'),
      icon: 'i-lucide-user',
      value: 'personal' as const,
    },
    {
      label: t('auth.business'),
      icon: 'i-lucide-building',
      value: 'business' as const,
    },
  ]
})
</script>

<template>
  <div class="c-sign-up flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-2xl">
      <div class="p-6">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {{ t('auth.welcome') }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('authExtra.noAccount') }} <ULink
              :to="localePath('/login')"
              class="text-primary font-medium"
            >{{ t('auth.login') }}</ULink>
          </p>
        </div>

        <!--
          The tab bar is client-only on purpose: server-rendered, this `UTabs`
          never hydrates its interactivity — the markup and ARIA come out
          correct and no console error fires, but the trigger emits nothing, so
          clicking "Business account" did nothing at all and business
          self-signup was unreachable.

          Panels render as siblings (`:content="false"`) rather than in the
          component's own slots, so the default Personal form still
          server-renders instead of the whole signup surface going blank
          until hydration.
        -->
        <ClientOnly>
          <UTabs
            v-model="activeTab"
            :items="tabItems"
            :content="false"
            class="w-full"
            variant="pill"
          />
        </ClientOnly>

        <FormsPersonalSignUpForm v-if="activeTab === 'personal'" />
        <FormsBusinessSignUpForm v-else />
      </div>
    </UPageCard>
  </div>
</template>
