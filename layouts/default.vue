<template>
  <div>
    <TopNav />
    <main class="py-8">
      <slot />
    </main>
    <footer class="mt-12 py-6 text-center text-sm text-gray-500">
      © 2025 Hip-Hop Store
    </footer>
  </div>
</template>

<script setup>
// default layout applied across pages
</script>

<style scoped>
main { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }
</style>
