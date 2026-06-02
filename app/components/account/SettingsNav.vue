<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

// B2B gate: only company members see the company/team sections (D-D-6). The
// composable is client-gated and returns `isB2B` false for non-members.
const { isB2B } = useCompanyContext()

interface NavItem {
  key: string
  to: string
  icon: string
}

const items = computed<NavItem[]>(() => {
  const base: NavItem[] = [
    { key: 'profile', to: localePath('/account/settings/profile'), icon: 'i-lucide-user' },
    { key: 'security', to: localePath('/account/settings/security'), icon: 'i-lucide-lock' },
    { key: 'addresses', to: localePath('/account/settings/addresses'), icon: 'i-lucide-map-pin' },
    { key: 'preferences', to: localePath('/account/settings/preferences'), icon: 'i-lucide-settings-2' },
    { key: 'privacy', to: localePath('/account/settings/privacy'), icon: 'i-lucide-shield' },
  ]
  // --- B2B-gated entries (appended for company members only) ---
  // Comp-fe owns this `company` line; Team-fe appends its `team` line here too.
  if (isB2B.value) {
    base.push({ key: 'company', to: localePath('/account/settings/company'), icon: 'i-lucide-building' })
  }
  return base
})

function isActive(to: string) {
  return route.path === to
}

const BASE_CLASS = [
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
].join(' ')
const ACTIVE_CLASS = 'bg-primary/10 text-primary'
const INACTIVE_CLASS
  = 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
</script>

<template>
  <nav
    class="c-settings-nav"
    :aria-label="t('account.settings.title')"
  >
    <ul class="flex flex-col gap-1">
      <li
        v-for="item in items"
        :key="item.key"
      >
        <NuxtLink
          :to="item.to"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          :class="[BASE_CLASS, isActive(item.to) ? ACTIVE_CLASS : INACTIVE_CLASS]"
        >
          <UIcon
            :name="item.icon"
            class="size-4 shrink-0"
          />
          <span>{{ t(`account.settings.nav.${item.key}`) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
