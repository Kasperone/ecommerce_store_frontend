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

    <LayoutCookieBanner />
  </div>
</template>

<script setup>
// default layout applied across pages
</script>
