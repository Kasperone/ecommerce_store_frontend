/**
 * Shared TypeScript types for home page content.
 */

export interface HeroSlideLink {
  /** i18n key for the button label */
  labelKey: string
  to: string
  variant?: 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link'
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  icon?: string
}

export interface HeroSlide {
  id: string
  /** i18n key, e.g. `slider.slides.summer.headline` */
  headlineKey?: string
  titleKey: string
  descriptionKey: string
  /** Optional full-bleed background image rendered behind the slide content. */
  background?: string
  /** Alt text for the background image. Leave empty/undefined for purely decorative backgrounds. */
  backgroundAlt?: string
  /** Optional side image rendered in the PageHero default slot. */
  image?: string
  imageAlt?: string
  links: HeroSlideLink[]
}
