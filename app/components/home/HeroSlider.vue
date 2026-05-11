<script setup lang="ts">
import type { HeroSlide } from '#shared/types/home'
import { HERO_SLIDES } from '#shared/mocks/home'

const { t } = useI18n()
const localePath = useLocalePath()

const props = withDefaults(defineProps<{
  slides?: HeroSlide[]
  autoplayDelay?: number
}>(), {
  slides: () => HERO_SLIDES,
  autoplayDelay: 6000,
})

const carouselItems = computed(() => props.slides)

function slideLinks(slide: HeroSlide) {
  return slide.links.map(link => ({
    label: t(link.labelKey),
    to: localePath(link.to),
    variant: link.variant ?? 'solid',
    color: link.color ?? 'primary',
    icon: link.icon,
    trailing: Boolean(link.icon),
  }))
}

const heroUiOverlay = {
  title: 'text-white!',
  description: 'text-white/90!',
  headline: 'text-white/80! font-semibold',
}
</script>

<template>
  <section class="c-hero-slider">
    <UCarousel
      v-slot="{ item }: { item: HeroSlide }"
      :items="carouselItems"
      loop
      arrows
      dots
      :autoplay="{ delay: autoplayDelay }"
      :ui="{ container: 'flex items-stretch flex-row -ms-4', item: 'basis-full' }"
      class="w-full"
    >
      <div class="relative isolate overflow-hidden h-full flex flex-col justify-center">
        <img
          v-if="item.background"
          :src="item.background"
          :alt="item.backgroundAlt ?? ''"
          class="absolute inset-0 -z-20 w-full h-full object-cover"
          loading="lazy"
        >
        <div
          v-if="item.background"
          class="absolute inset-0 -z-10 bg-gradient-to-r from-black/45 via-black/20 to-transparent"
          aria-hidden="true"
        />

        <UPageHero
          :headline="item.headlineKey ? t(item.headlineKey) : undefined"
          :title="t(item.titleKey)"
          :description="t(item.descriptionKey)"
          :links="slideLinks(item)"
          orientation="horizontal"
          :ui="item.background ? heroUiOverlay : undefined"
        >
          <img
            v-if="item.image"
            :src="item.image"
            :alt="item.imageAlt ?? ''"
            class="w-full h-auto rounded-lg shadow-2xl ring ring-default object-cover"
            loading="lazy"
          >
        </UPageHero>
      </div>
    </UCarousel>
  </section>
</template>
