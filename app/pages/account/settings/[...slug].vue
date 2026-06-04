<script setup lang="ts">
// Redirect stub: catches every old `/account/settings/<x>` path (Phase 2 of the
// account-panel redesign flattened them to `/account/<x>`) and 301s to the new
// location. See app/middleware/account-settings-redirect.ts.
definePageMeta({
  middleware: 'account-settings-redirect',
})
</script>

<template>
  <div />
</template>
