<script setup lang="ts">
const { t } = useI18n()

// Locale-aware title (the global titleTemplate in app.vue appends the brand).
useSeoMeta({
  title: () => t('auth.login'),
})
</script>

<template>
  <NuxtLayout>
    <FormsLoginForm class="p-login" />
  </NuxtLayout>
</template>
