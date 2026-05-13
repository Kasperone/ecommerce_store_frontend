<script setup lang="ts">
import { useI18n } from 'vue-i18n'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
const KEY = 'categories'

useHead({ title: () => t(`admin.pages.${KEY}.title`) })
</script>

<template>
  <div class="c-admin-page max-w-5xl">
    <h1 class="text-2xl font-bold mb-2">{{ $t(`admin.pages.${KEY}.title`) }}</h1>
    <p class="text-muted">{{ $t(`admin.pages.${KEY}.placeholder`) }}</p>
  </div>
</template>
