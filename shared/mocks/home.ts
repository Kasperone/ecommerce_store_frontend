/**
 * Mock data for the home page.
 *
 * Replace each entry with backend-driven data once the storefront content API
 * lands. Images live in `public/images/home/hero/` so they ship as static
 * assets and don't require external network access at runtime.
 */

import type { HeroSlide } from '#shared/types/home'

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'growing-season',
    headlineKey: 'slider.slides.growingSeason.headline',
    titleKey: 'slider.slides.growingSeason.title',
    descriptionKey: 'slider.slides.growingSeason.description',
    background: '/images/home/hero/summer-banner.jpg',
    backgroundAlt: 'Aerial view of farmland in early summer',
    links: [
      { labelKey: 'slider.slides.growingSeason.cta', to: '/tab-1', icon: 'i-lucide-arrow-right' },
      { labelKey: 'cta.learnMore', to: '/tab-2', variant: 'ghost' },
    ],
  },
  {
    id: 'crop-protection',
    headlineKey: 'slider.slides.cropProtection.headline',
    titleKey: 'slider.slides.cropProtection.title',
    descriptionKey: 'slider.slides.cropProtection.description',
    background: '/images/home/hero/sprayer-banner.jpg',
    backgroundAlt: 'Tractor spraying a field of young crops',
    links: [
      { labelKey: 'slider.slides.cropProtection.cta', to: '/tab-2', icon: 'i-lucide-spray-can' },
    ],
  },
  {
    id: 'harvest',
    headlineKey: 'slider.slides.harvest.headline',
    titleKey: 'slider.slides.harvest.title',
    descriptionKey: 'slider.slides.harvest.description',
    background: '/images/home/hero/vegetables-banner.jpg',
    backgroundAlt: 'Assortment of freshly harvested vegetables',
    links: [
      { labelKey: 'slider.slides.harvest.cta', to: '/tab-3', icon: 'i-lucide-leaf' },
    ],
  },
]
