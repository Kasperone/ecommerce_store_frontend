import { computed, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { Capability } from '#shared/constants/capabilities'

interface MenuItemConfig {
  key: string
  to: string
  icon: string
  // Capability required to *reach* this section — always the `<domain>:read`
  // its landing page's primary GET is gated on, never the write capability.
  // A scoped staffer who lacks it doesn't see the entry; an owner always does.
  //
  // Gating on the write cap made the UI silently stricter than the API: reads
  // became grantable in the staff editor, so an admin could hand out
  // `orders:read` alone and the staffer would see no Orders link while
  // `GET /orders/` served them fine. No error, just a missing nav item — the
  // same failure the `effective_capabilities` work fixed one level up.
  //
  // The read caps here are the ones the backend routers actually declare, not
  // a guess: `/admin/gift-cards` reads on `orders:read` though it *writes* on
  // `orders:refund`; companies/price-lists/payment-terms are `companies:read`,
  // not `customers:read`; shipping and tax are their own reads, not
  // `settings:read`. reports:read / audit:read are standalone — no write
  // implies them, which is the SEC-021 tightening. Typed to the taxonomy so a
  // typo — which would hide the entry from everyone but an owner — fails the
  // build.
  cap?: Capability
}

interface MenuGroupConfig {
  key: string
  items: MenuItemConfig[]
}

const GROUPS: MenuGroupConfig[] = [
  {
    key: 'overview',
    items: [
      // The dashboard is a reports surface (revenue, top products) and has 403'd
      // for a staffer without reports:read since BE #242 — it is standalone, so
      // no write capability implies it.
      { key: 'dashboard', to: '/admin', icon: 'i-lucide-layout-dashboard', cap: 'reports:read' },
    ],
  },
  {
    key: 'catalog',
    items: [
      { key: 'products', to: '/admin/products', icon: 'i-lucide-package', cap: 'catalog:read' },
      { key: 'categories', to: '/admin/categories', icon: 'i-lucide-tags', cap: 'catalog:read' },
      { key: 'collections', to: '/admin/collections', icon: 'i-lucide-layers', cap: 'catalog:read' },
      { key: 'inventory', to: '/admin/inventory', icon: 'i-lucide-boxes', cap: 'inventory:read' },
      { key: 'warehouses', to: '/admin/warehouses', icon: 'i-lucide-warehouse', cap: 'inventory:read' },
      { key: 'reviews', to: '/admin/reviews', icon: 'i-lucide-message-square', cap: 'catalog:read' },
    ],
  },
  {
    key: 'sales',
    items: [
      { key: 'orders', to: '/admin/orders', icon: 'i-lucide-shopping-cart', cap: 'orders:read' },
      { key: 'draftOrders', to: '/admin/draft-orders', icon: 'i-lucide-file-pen-line', cap: 'orders:read' },
      { key: 'returns', to: '/admin/returns', icon: 'i-lucide-undo-2', cap: 'orders:read' },
      { key: 'customers', to: '/admin/customers', icon: 'i-lucide-users', cap: 'customers:read' },
      { key: 'companies', to: '/admin/companies', icon: 'i-lucide-building-2', cap: 'companies:read' },
      { key: 'priceLists', to: '/admin/price-lists', icon: 'i-lucide-tag', cap: 'companies:read' },
      { key: 'paymentTerms', to: '/admin/payment-terms', icon: 'i-lucide-calendar-clock', cap: 'companies:read' },
      { key: 'quotes', to: '/admin/quotes', icon: 'i-lucide-file-text', cap: 'orders:read' },
    ],
  },
  {
    key: 'marketing',
    items: [
      { key: 'pages', to: '/admin/pages', icon: 'i-lucide-layout-template', cap: 'content:read' },
      { key: 'coupons', to: '/admin/coupons', icon: 'i-lucide-ticket', cap: 'marketing:read' },
      { key: 'giftCards', to: '/admin/gift-cards', icon: 'i-lucide-gift', cap: 'orders:read' },
      { key: 'banners', to: '/admin/banners', icon: 'i-lucide-image', cap: 'marketing:read' },
      { key: 'campaigns', to: '/admin/campaigns', icon: 'i-lucide-megaphone', cap: 'marketing:read' },
      { key: 'segments', to: '/admin/segments', icon: 'i-lucide-users-round', cap: 'customers:read' },
    ],
  },
  {
    key: 'operations',
    items: [
      { key: 'shipping', to: '/admin/shipping', icon: 'i-lucide-truck', cap: 'shipping:read' },
      { key: 'reports', to: '/admin/reports', icon: 'i-lucide-bar-chart-3', cap: 'reports:read' },
      { key: 'auditLog', to: '/admin/audit-log', icon: 'i-lucide-scroll-text', cap: 'audit:read' },
    ],
  },
  {
    key: 'configuration',
    items: [
      { key: 'settings', to: '/admin/settings', icon: 'i-lucide-settings', cap: 'settings:read' },
      { key: 'tax', to: '/admin/tax', icon: 'i-lucide-percent', cap: 'tax:read' },
      { key: 'translations', to: '/admin/translations', icon: 'i-lucide-languages', cap: 'settings:read' },
      { key: 'staff', to: '/admin/staff', icon: 'i-lucide-shield-check', cap: 'staff:read' },
    ],
  },
]

/**
 * Filter the menu groups to what a staffer may use. An item needs `can(cap)`;
 * one with no `cap` would be unconditionally visible, but none are left. Groups
 * left with no visible items are dropped. Pure (takes the `can` predicate) so
 * it's unit-testable without a Nuxt runtime — and `can` must be backed by the
 * server's *effective* capabilities, or every `*:read` entry here hides itself
 * from the staffer whose write grant implies it.
 */
export function visibleAdminMenuGroups(
  can: (cap: string) => boolean,
): MenuGroupConfig[] {
  return GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => !item.cap || can(item.cap)),
  })).filter(group => group.items.length > 0)
}

export function useAdminSidebarGroups(): ComputedRef<NavigationMenuItem[][]> {
  const { t } = useI18n()
  const route = useRoute()
  const localePath = useLocalePath()
  const auth = useAuthStore()

  return computed(() =>
    visibleAdminMenuGroups(cap => auth.can(cap)).map(group => [
      { label: t(`admin.menu.groups.${group.key}`), type: 'label' as const },
      ...group.items.map((item): NavigationMenuItem => ({
        label: t(`admin.menu.items.${item.key}`),
        icon: item.icon,
        to: localePath(item.to),
        active: item.to === '/admin'
          ? route.path === '/admin' || route.path === '/pl/admin'
          : route.path.startsWith(item.to) || route.path.startsWith(`/pl${item.to}`),
      })),
    ]),
  )
}

export { GROUPS as adminMenuGroups }
export type { MenuItemConfig, MenuGroupConfig }
