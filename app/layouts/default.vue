<template>
  <div class="l-default w-full max-w-[2560px] min-h-screen flex flex-col">
    <LayoutHeader />
    <CartDrawer />

    <div class="flex-1 flex flex-col">
      <main class="flex-1">
        <slot />
      </main>

      <LayoutFooter />
    </div>

    <!-- Client-only: the banner's `<Teleport to="body">` SSR-renders inline, and
         under @nuxt/ui 4.8 / reka-ui 2.9 the client-side teleport hydration no
         longer adopts that inline copy — leaving an orphaned duplicate dialog in
         the DOM plus a hydration mismatch. The banner is interactive-only, so
         skipping SSR loses nothing. -->
    <ClientOnly>
      <LayoutCookieBanner />
    </ClientOnly>
  </div>
</template>

<script setup>
// default layout applied across pages
</script>
