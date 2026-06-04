<template>
  <div class="l-account w-full max-w-[2560px] min-h-screen flex flex-col">
    <LayoutHeader />
    <CartDrawer />

    <div class="flex-1 flex flex-col">
      <main class="flex-1">
        <div class="mx-auto w-full max-w-6xl px-4 py-6 md:flex md:gap-8">
          <!-- Persistent account rail. On desktop (md+) it's an always-on
               sidebar; on mobile it folds into a ☰ drawer so the nav never
               vanishes (account-panel redesign, Phase 4, §3.6). -->
          <aside class="hidden md:mb-0 md:block md:w-60 md:shrink-0">
            <AccountNav />
          </aside>

          <!-- Mobile-only nav trigger (<md). Opens the same rail in a left
               drawer; reuses <AccountNav /> verbatim so the grouped IA + B2B
               gating stay identical to desktop. -->
          <div class="mb-4 md:hidden">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-menu"
              block
              class="justify-start"
              :aria-label="$t('account.nav.title')"
              @click="navOpen = true"
            >
              {{ $t('account.nav.title') }}
            </UButton>
          </div>

          <USlideover
            v-model:open="navOpen"
            side="left"
            :title="$t('account.nav.title')"
          >
            <template #body>
              <AccountNav />
            </template>
          </USlideover>

          <div class="min-w-0 flex-1">
            <slot />
          </div>
        </div>
      </main>

      <LayoutFooter />
    </div>
  </div>
</template>

<script setup>
// account layout: the persistent shell for the customer account panel. Mirrors
// `default.vue` (header + cart drawer + footer) and adds the always-on nav rail
// (desktop) / ☰ drawer (mobile, Phase 4).
const route = useRoute()
const navOpen = ref(false)

// Close the mobile drawer whenever the route changes — i.e. when a nav link is
// tapped — so the user lands on the new page with the drawer dismissed.
watch(() => route.path, () => {
  navOpen.value = false
})
</script>
