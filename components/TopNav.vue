<template>
  <header class="bg-white border-b shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <div class="flex items-center">
          <NuxtLink to="/" class="text-lg font-semibold">Hip-Hop Store</NuxtLink>
        </div>
        <nav>
          <ul class="flex gap-4 items-center">
            <li><NuxtLink to="/">Home</NuxtLink></li>
            <li><NuxtLink to="/products">Products</NuxtLink></li>
            <li><NuxtLink to="/cart">Cart</NuxtLink></li>
            <li><NuxtLink to="/login">Login</NuxtLink></li>
          </ul>
        </nav>
      </div>
    </div>
  </header>
</template>

<script setup>
// lightweight top navigation component — uses NuxtLink for client-side routing
</script>

<style scoped>
/* basic styling — project uses Tailwind so these are minimal fallbacks */
header { background: var(--color-bg, white); }
ul { list-style: none; margin: 0; padding: 0; }
a { color: inherit; text-decoration: none; }
</style>
