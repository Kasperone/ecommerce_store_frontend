<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const { locale, setLocale, t } = useI18n()

function toggleLocale() {
  setLocale(locale.value === 'pl' ? 'en' : 'pl')
}

const items = computed<NavigationMenuItem[]>(() => [{
  label: 'Tab-1',
  to: '/tab-1',
  active: route.path.startsWith('/tab-1')
}, {
  label: 'Tab-2',
  to: '/tab-2',
  active: route.path.startsWith('/tab-2')
}, {
  label: 'Tab-3',
  to: '/tab-3',
  active: route.path.startsWith('/tab-3')
}, {
  label: 'Tab-4',
  to: '/tab-4',
  active: route.path.startsWith('/tab-4')
}])
</script>

<template>
  <UHeader
    class="c-header"
    :toggle="{
      color: 'primary',
      variant: 'subtle',
      class: 'rounded-full'
    }">
    <template #title>
      <p class="text-lg font-semibold">LOGO</p>
    </template>

    <UNavigationMenu :items="items" />

    <template #right>
      <UColorModeButton class="cursor-pointer"/>

      <UTooltip :text="t('header.toggleLang')">
          <UButton color="neutral"
                   variant="ghost"
                   class="ml-2 px-2 text-sm cursor-pointer"
                   @click="toggleLocale"
                   aria-label="Toggle language">
            {{ locale === 'pl' ? 'PL' : 'EN' }}
          </UButton>
      </UTooltip>

      <UTooltip :text="t('header.login')">
        <UButton color="neutral"
                        variant="ghost"
                        class="ml-2 px-2"
                        aria-label="Login"
                        to="/login"
                        icon="i-lucide-log-in" />
      </UTooltip>

      <UTooltip :text="t('header.signUp')">
        <UButton color="neutral" 
                 variant="ghost"
                 class="ml-2 px-2"
                 aria-label="Sign up"
                 to="/sign-up"
                 icon="i-lucide-user-plus" />
      </UTooltip>

      <UButton
        color="neutral"
        variant="ghost"
        class="ml-2 px-2 text-sm"
        @click="toggleLocale"
        aria-label="Toggle language"
      >
        {{ locale === 'pl' ? 'PL' : 'EN' }}
      </UButton>
    </template>

    <template #body>
      <UNavigationMenu :items="items" 
                       orientation="vertical"
                       class="-mx-2.5" />
    </template>
  </UHeader>
</template>

