import { computed, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { NavigationMenuItem } from '@nuxt/ui'

interface MenuItemConfig {
  key: string
  to: string
  icon: string
  // Capability required to *use* this section (its primary write surface). A
  // scoped staffer who lacks it doesn't see the entry — an owner (or a staffer
  // holding the cap) does. Omit for read-only sections (dashboard/reports/audit)
  // that stay visible to any staff.
  cap?: string
}

interface MenuGroupConfig {
  key: string
  items: MenuItemConfig[]
}

const GROUPS: MenuGroupConfig[] = [
  {
    key: 'overview',
    items: [
      { key: 'dashboard', to: '/admin', icon: 'i-lucide-layout-dashboard' },
    ],
  },
  {
    key: 'catalog',
    items: [
      { key: 'products', to: '/admin/products', icon: 'i-lucide-package', cap: 'catalog:write' },
      { key: 'categories', to: '/admin/categories', icon: 'i-lucide-tags', cap: 'catalog:write' },
      { key: 'collections', to: '/admin/collections', icon: 'i-lucide-layers', cap: 'catalog:write' },
      { key: 'inventory', to: '/admin/inventory', icon: 'i-lucide-boxes', cap: 'inventory:write' },
      { key: 'warehouses', to: '/admin/warehouses', icon: 'i-lucide-warehouse', cap: 'inventory:write' },
      { key: 'reviews', to: '/admin/reviews', icon: 'i-lucide-message-square', cap: 'catalog:write' },
    ],
  },
  {
    key: 'sales',
    items: [
      { key: 'orders', to: '/admin/orders', icon: 'i-lucide-shopping-cart', cap: 'orders:write' },
      { key: 'draftOrders', to: '/admin/draft-orders', icon: 'i-lucide-file-pen-line', cap: 'orders:write' },
      { key: 'returns', to: '/admin/returns', icon: 'i-lucide-undo-2', cap: 'orders:write' },
      { key: 'customers', to: '/admin/customers', icon: 'i-lucide-users', cap: 'customers:write' },
      { key: 'companies', to: '/admin/companies', icon: 'i-lucide-building-2', cap: 'customers:write' },
      { key: 'priceLists', to: '/admin/price-lists', icon: 'i-lucide-tag', cap: 'customers:write' },
      { key: 'quotes', to: '/admin/quotes', icon: 'i-lucide-file-text', cap: 'orders:write' },
    ],
  },
  {
    key: 'marketing',
    items: [
      { key: 'pages', to: '/admin/pages', icon: 'i-lucide-layout-template', cap: 'content:write' },
      { key: 'coupons', to: '/admin/coupons', icon: 'i-lucide-ticket', cap: 'marketing:write' },
      { key: 'giftCards', to: '/admin/gift-cards', icon: 'i-lucide-gift', cap: 'orders:refund' },
      { key: 'banners', to: '/admin/banners', icon: 'i-lucide-image', cap: 'marketing:write' },
      { key: 'campaigns', to: '/admin/campaigns', icon: 'i-lucide-megaphone', cap: 'marketing:write' },
      { key: 'segments', to: '/admin/segments', icon: 'i-lucide-users-round', cap: 'customers:write' },
    ],
  },
  {
    key: 'operations',
    items: [
      { key: 'shipping', to: '/admin/shipping', icon: 'i-lucide-truck', cap: 'settings:write' },
      { key: 'reports', to: '/admin/reports', icon: 'i-lucide-bar-chart-3' },
      { key: 'auditLog', to: '/admin/audit-log', icon: 'i-lucide-scroll-text' },
    ],
  },
  {
    key: 'configuration',
    items: [
      { key: 'settings', to: '/admin/settings', icon: 'i-lucide-settings', cap: 'settings:write' },
      { key: 'translations', to: '/admin/translations', icon: 'i-lucide-languages', cap: 'settings:write' },
      { key: 'staff', to: '/admin/staff', icon: 'i-lucide-shield-check', cap: 'staff:write' },
    ],
  },
]

/**
 * Filter the menu groups to what a staffer may use. An item with no `cap` is
 * always visible (read-only section); otherwise it needs `can(cap)`. Groups
 * left with no visible items are dropped. Pure (takes the `can` predicate) so
 * it's unit-testable without a Nuxt runtime.
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
