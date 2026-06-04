<template>
  <div class="l-account w-full max-w-[2560px] min-h-screen flex flex-col">
    <LayoutHeader />
    <CartDrawer />

    <div class="flex-1 flex flex-col">
      <main class="flex-1">
        <div class="mx-auto w-full max-w-6xl px-4 py-6 md:flex md:gap-8">
          <!-- Persistent account rail — present on every /account/* page so the
               nav never vanishes inside a sub-page (account-panel redesign,
               Phase 1, defect D3). Collapses above the content on mobile rather
               than disappearing. -->
          <aside class="mb-6 md:mb-0 md:w-60 md:shrink-0">
            <AccountNav />
          </aside>

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
// `default.vue` (header + cart drawer + footer) and adds the always-on nav rail.
</script>
