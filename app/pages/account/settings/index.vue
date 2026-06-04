<script setup lang="ts">
// Redirect stub: the menu-only settings hub was removed in Phase 2 of the
// account-panel redesign. `/account/settings` now 301s to `/account`.
// See app/middleware/account-settings-redirect.ts.
definePageMeta({
  middleware: 'account-settings-redirect',
})
</script>

<template>
  <div />
</template>
