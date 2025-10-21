<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

const items = computed<NavigationMenuItem[]>(() => [{
  label: 'Docs',
  to: '/docs/getting-started',
  icon: 'i-lucide-book-open',
  active: route.path.startsWith('/docs/getting-started')
}, {
  label: 'Components',
  to: '/docs/components',
  icon: 'i-lucide-box',
  active: route.path.startsWith('/docs/components')
}, {
  label: 'Figma',
  icon: 'i-simple-icons-figma',
  to: 'https://go.nuxt.com/figma-ui',
  target: '_blank'
}, {
  label: 'Releases',
  icon: 'i-lucide-rocket',
  to: 'https://github.com/nuxt/ui/releases',
  target: '_blank'
}])
</script>

<template>
  <UHeader
    class="c-header"
    :toggle="{
      color: 'primary',
      variant: 'subtle',
      class: 'rounded-full'
    }"
  >
    <template #title>
      <p class="text-lg font-semibold">LOGO</p>
    </template>

    <UNavigationMenu :items="items" />

    <template #right>
      <UColorModeButton />

      <UTooltip text="Open on GitHub" :kbds="['meta', 'G']">
        <UButton
          color="neutral"
          variant="ghost"
          to="https://github.com/nuxt/ui"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
        />
      </UTooltip>
    </template>

    <template #body>
      <UNavigationMenu :items="items" orientation="vertical" class="-mx-2.5" />
    </template>
  </UHeader>
</template>

