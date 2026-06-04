<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Account navigation rail. Widened from the old settings-only `SettingsNav`
 * (account-panel redesign, Phase 1): it now leads with the transactional
 * entries (Overview / Orders / Quotes), groups the account-management settings,
 * keeps the B2B-gated company section, and demotes Privacy to the bottom — the
 * grouped IA from §3.2 of the redesign blueprint. Rendered once, persistently,
 * by `layouts/account.vue` so it never vanishes inside a sub-page (defect D3).
 *
 * The account-management entries point at the flattened `/account/<x>` routes
 * (Phase 2 route flatten; the old `/account/settings/<x>` paths 301-redirect).
 */

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

// B2B gate: only company members see Quotes + the company/team section. The
// composable is client-gated and returns `isB2B` false for non-members; the
// `team` entry is additionally COMPANY_ADMIN-only.
const { isB2B, company } = useCompanyContext()
const isCompanyAdmin = computed(() => company.value?.role === 'COMPANY_ADMIN')

interface NavItem {
  key: string
  to: string
  icon: string
  // `prefix` items (sections with sub-pages, e.g. an order detail) stay active
  // for any descendant path; the rest match exactly.
  match?: 'exact' | 'prefix'
}

// Primary / transactional entries — always visible, lead the rail (Baymard
// "primary vs secondary paths").
const primaryItems = computed<NavItem[]>(() => [
  { key: 'overview', to: localePath('/account'), icon: 'i-lucide-layout-dashboard', match: 'exact' },
  { key: 'orders', to: localePath('/account/orders'), icon: 'i-lucide-package', match: 'prefix' },
])

// Quotes is B2B-only but still a primary path — kept separate so it renders
// under <ClientOnly> alongside the company section (authed, SSR-unserialized).
const quotesItem = computed<NavItem>(() => (
  { key: 'quotes', to: localePath('/account/quotes'), icon: 'i-lucide-file-text', match: 'prefix' }
))

// Account-management group (labelled "Account").
const accountItems = computed<NavItem[]>(() => [
  { key: 'profile', to: localePath('/account/profile'), icon: 'i-lucide-user', match: 'exact' },
  { key: 'addresses', to: localePath('/account/addresses'), icon: 'i-lucide-map-pin', match: 'exact' },
  { key: 'security', to: localePath('/account/security'), icon: 'i-lucide-lock', match: 'exact' },
  { key: 'preferences', to: localePath('/account/preferences'), icon: 'i-lucide-settings-2', match: 'exact' },
])

// B2B company group (Wave D): `company` for any company member, `team` for
// COMPANY_ADMIN only. Rendered under <ClientOnly> in the template.
const companyItems = computed<NavItem[]>(() => {
  if (!isB2B.value) return []
  const out: NavItem[] = [
    { key: 'company', to: localePath('/account/company'), icon: 'i-lucide-building', match: 'exact' },
  ]
  if (isCompanyAdmin.value) {
    out.push({ key: 'team', to: localePath('/account/team'), icon: 'i-lucide-users', match: 'exact' })
  }
  return out
})

// Privacy / legal — demoted to the bottom.
const privacyItem = computed<NavItem>(() => (
  { key: 'privacy', to: localePath('/account/privacy'), icon: 'i-lucide-shield', match: 'exact' }
))

function isActive(item: NavItem) {
  if (item.match === 'prefix') {
    return route.path === item.to || route.path.startsWith(`${item.to}/`)
  }
  return route.path === item.to
}

// Item labels reuse the existing `account.settings.nav.*` strings (profile,
// security, …); the new top-level + group labels live under `account.nav.*`.
function label(key: string) {
  if (key === 'overview' || key === 'orders' || key === 'quotes') {
    return t(`account.nav.${key}`)
  }
  return t(`account.settings.nav.${key}`)
}

const BASE_CLASS = [
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
].join(' ')
const ACTIVE_CLASS = 'bg-primary/10 text-primary'
const INACTIVE_CLASS
  = 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
const GROUP_HEADING_CLASS
  = 'px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500'
</script>

<template>
  <nav
    class="c-account-nav"
    :aria-label="t('account.nav.title')"
  >
    <!-- Primary / transactional -->
    <ul class="flex flex-col gap-1">
      <li
        v-for="item in primaryItems"
        :key="item.key"
      >
        <NuxtLink
          :to="item.to"
          :aria-current="isActive(item) ? 'page' : undefined"
          :class="[BASE_CLASS, isActive(item) ? ACTIVE_CLASS : INACTIVE_CLASS]"
        >
          <UIcon
            :name="item.icon"
            class="size-4 shrink-0"
          />
          <span>{{ label(item.key) }}</span>
        </NuxtLink>
      </li>

      <!-- Quotes: B2B-only, but a primary path. -->
      <ClientOnly>
        <li v-if="isB2B">
          <NuxtLink
            :to="quotesItem.to"
            :aria-current="isActive(quotesItem) ? 'page' : undefined"
            :class="[BASE_CLASS, isActive(quotesItem) ? ACTIVE_CLASS : INACTIVE_CLASS]"
          >
            <UIcon
              :name="quotesItem.icon"
              class="size-4 shrink-0"
            />
            <span>{{ label(quotesItem.key) }}</span>
          </NuxtLink>
        </li>
      </ClientOnly>
    </ul>

    <!-- Account-management group -->
    <p
      :class="GROUP_HEADING_CLASS"
      class="mt-4"
    >
      {{ t('account.nav.groupAccount') }}
    </p>
    <ul class="mt-1 flex flex-col gap-1">
      <li
        v-for="item in accountItems"
        :key="item.key"
      >
        <NuxtLink
          :to="item.to"
          :aria-current="isActive(item) ? 'page' : undefined"
          :class="[BASE_CLASS, isActive(item) ? ACTIVE_CLASS : INACTIVE_CLASS]"
        >
          <UIcon
            :name="item.icon"
            class="size-4 shrink-0"
          />
          <span>{{ label(item.key) }}</span>
        </NuxtLink>
      </li>
    </ul>

    <!-- B2B company group — only for resolved company accounts. -->
    <ClientOnly>
      <template v-if="companyItems.length > 0">
        <p
          :class="GROUP_HEADING_CLASS"
          class="mt-4"
        >
          {{ t('account.nav.groupCompany') }}
        </p>
        <ul
          class="mt-1 flex flex-col gap-1"
          :aria-label="t('account.nav.groupCompany')"
        >
          <li
            v-for="item in companyItems"
            :key="item.key"
          >
            <NuxtLink
              :to="item.to"
              :aria-current="isActive(item) ? 'page' : undefined"
              :class="[BASE_CLASS, isActive(item) ? ACTIVE_CLASS : INACTIVE_CLASS]"
            >
              <UIcon
                :name="item.icon"
                class="size-4 shrink-0"
              />
              <span>{{ label(item.key) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </template>
    </ClientOnly>

    <!-- Privacy / legal — demoted to the bottom. -->
    <ul class="mt-4 flex flex-col gap-1 border-t border-gray-200 pt-4 dark:border-gray-800">
      <li>
        <NuxtLink
          :to="privacyItem.to"
          :aria-current="isActive(privacyItem) ? 'page' : undefined"
          :class="[BASE_CLASS, isActive(privacyItem) ? ACTIVE_CLASS : INACTIVE_CLASS]"
        >
          <UIcon
            :name="privacyItem.icon"
            class="size-4 shrink-0"
          />
          <span>{{ label(privacyItem.key) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
