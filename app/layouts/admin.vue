<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAdminSidebarGroups } from '~/components/admin/sidebarMenu'

const { locale, setLocale, t } = useI18n()
const authStore = useAuthStore()
const groups = useAdminSidebarGroups()
const localePath = useLocalePath()

function toggleLocale() {
  setLocale(locale.value === 'pl' ? 'en' : 'pl')
}
</script>

<template>
  <UDashboardGroup class="l-admin">
    <UDashboardSidebar
      collapsible
      resizable
      :min-size="14"
      :max-size="22"
      :default-size="16"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          :to="localePath('/admin')"
          class="flex items-center gap-2"
        >
          <UIcon
            name="i-lucide-shield"
            class="text-primary text-xl"
          />
          <span
            v-if="!collapsed"
            class="text-lg font-semibold truncate"
          >
            {{ t('admin.dashboard') }}
          </span>
        </NuxtLink>
      </template>

      <UNavigationMenu
        :items="groups"
        orientation="vertical"
        class="flex-1"
      />

      <template #footer="{ collapsed }">
        <div
          v-if="!collapsed"
          class="text-xs text-muted truncate px-1"
        >
          {{ t('admin.signedInAs') }} {{ authStore.user?.email }}
        </div>
        <UDashboardSidebarCollapse />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <UDashboardNavbar :title="t('admin.dashboard')">
        <template #leading>
          <UDashboardSidebarToggle />
        </template>
        <template #right>
          <UTooltip :text="t('header.toggleLang')">
            <UButton
              color="neutral"
              variant="ghost"
              class="px-2 text-sm cursor-pointer"
              :aria-label="t('header.toggleLang')"
              @click="toggleLocale"
            >
              {{ locale === 'pl' ? 'PL' : 'EN' }}
            </UButton>
          </UTooltip>
          <UColorModeButton class="cursor-pointer" />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-home"
            :to="localePath('/')"
            :aria-label="t('admin.menu.exit')"
          />
        </template>
      </UDashboardNavbar>

      <main class="flex-1 overflow-y-auto p-6">
        <slot />
      </main>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
