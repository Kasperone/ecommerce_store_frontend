<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const localePath = useLocalePath()

useHead({ title: () => t('hero.welcome') })

const { data: featured } = useFeaturedProducts(8)
const items = computed(() => featured.value ?? [])
</script>

<template>
  <NuxtLayout>
    <div class="p-main">
      <HomeHeroSlider />

      <section
        v-if="items.length"
        class="mx-auto w-full max-w-7xl px-4 py-12"
      >
        <div class="mb-6 flex items-center justify-between">
          <h2 class="text-2xl font-bold">
            {{ t('featured.title') }}
          </h2>
          <ULink
            :to="localePath('/products')"
            class="text-primary hover:underline"
          >
            {{ t('featured.viewAll') }}
          </ULink>
        </div>
        <ShopProductGrid :products="items" />
      </section>
    </div>
  </NuxtLayout>
</template>
