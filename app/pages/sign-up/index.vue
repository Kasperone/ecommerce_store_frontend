<script setup lang="ts">
const { t } = useI18n()

// Locale-aware title (the global titleTemplate in app.vue appends the brand).
useSeoMeta({
  title: () => t('auth.signUp'),
})
</script>

<template>
  <NuxtLayout>
    <div class="p-sign-up">
      <FormsSignUpForm />
    </div>
  </NuxtLayout>
</template>
