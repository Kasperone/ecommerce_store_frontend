/**
 * Block registry — maps a section's `type` discriminant to its Vue component.
 *
 * Each block is `defineAsyncComponent`-wrapped + dynamic-`import()`ed so a page
 * only ships the code for the blocks it actually uses (code-splitting). The
 * `PageRenderer` indexes this map by `section.type`, falling back to
 * `UnknownBlock` for any unregistered/since-removed type.
 *
 * Keys MUST match the backend `type` literals exactly (see `app/blocks/types.ts`
 * `SectionType`). The `Record<SectionType, ...>` annotation makes the compiler
 * flag a missing or misspelt entry the moment a block type is added/renamed.
 */
import { defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import type { SectionType } from './types'

export const blockRegistry: Record<SectionType, Component> = {
  'hero': defineAsyncComponent(() => import('./components/HeroBlock.vue')),
  'slideshow': defineAsyncComponent(() => import('./components/SlideshowBlock.vue')),
  'promo-strip': defineAsyncComponent(() => import('./components/PromoStripBlock.vue')),
  'product-grid': defineAsyncComponent(() => import('./components/ProductGridBlock.vue')),
  'product-carousel': defineAsyncComponent(() => import('./components/ProductCarouselBlock.vue')),
  'featured-product': defineAsyncComponent(() => import('./components/FeaturedProductBlock.vue')),
  'collection-list': defineAsyncComponent(() => import('./components/CollectionListBlock.vue')),
  'rich-text': defineAsyncComponent(() => import('./components/RichTextBlock.vue')),
  'image-with-text': defineAsyncComponent(() => import('./components/ImageWithTextBlock.vue')),
  'image-gallery': defineAsyncComponent(() => import('./components/ImageGalleryBlock.vue')),
  'faq': defineAsyncComponent(() => import('./components/FaqBlock.vue')),
  'coupon-callout': defineAsyncComponent(() => import('./components/CouponCalloutBlock.vue')),
  'spacer': defineAsyncComponent(() => import('./components/SpacerBlock.vue')),
  'custom-html': defineAsyncComponent(() => import('./components/CustomHtmlBlock.vue')),
}

/** Look up a block component by `type`, or `undefined` if unregistered. */
export function resolveBlock(type: string): Component | undefined {
  return blockRegistry[type as SectionType]
}
