import { computed, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { NavigationMenuItem } from '@nuxt/ui'

interface MenuItemConfig {
  key: string
  to: string
  icon: string
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
      { key: 'products', to: '/admin/products', icon: 'i-lucide-package' },
      { key: 'categories', to: '/admin/categories', icon: 'i-lucide-tags' },
      { key: 'collections', to: '/admin/collections', icon: 'i-lucide-layers' },
      { key: 'inventory', to: '/admin/inventory', icon: 'i-lucide-boxes' },
      { key: 'warehouses', to: '/admin/warehouses', icon: 'i-lucide-warehouse' },
      { key: 'reviews', to: '/admin/reviews', icon: 'i-lucide-message-square' },
    ],
  },
  {
    key: 'sales',
    items: [
      { key: 'orders', to: '/admin/orders', icon: 'i-lucide-shopping-cart' },
      { key: 'returns', to: '/admin/returns', icon: 'i-lucide-undo-2' },
      { key: 'customers', to: '/admin/customers', icon: 'i-lucide-users' },
      { key: 'companies', to: '/admin/companies', icon: 'i-lucide-building-2' },
      { key: 'quotes', to: '/admin/quotes', icon: 'i-lucide-file-text' },
    ],
  },
  {
    key: 'marketing',
    items: [
      { key: 'pages', to: '/admin/pages', icon: 'i-lucide-layout-template' },
      { key: 'coupons', to: '/admin/coupons', icon: 'i-lucide-ticket' },
      { key: 'banners', to: '/admin/banners', icon: 'i-lucide-image' },
      { key: 'campaigns', to: '/admin/campaigns', icon: 'i-lucide-megaphone' },
      { key: 'segments', to: '/admin/segments', icon: 'i-lucide-users-round' },
    ],
  },
  {
    key: 'operations',
    items: [
      { key: 'shipping', to: '/admin/shipping', icon: 'i-lucide-truck' },
      { key: 'reports', to: '/admin/reports', icon: 'i-lucide-bar-chart-3' },
      { key: 'auditLog', to: '/admin/audit-log', icon: 'i-lucide-scroll-text' },
    ],
  },
  {
    key: 'configuration',
    items: [
      { key: 'settings', to: '/admin/settings', icon: 'i-lucide-settings' },
      { key: 'staff', to: '/admin/staff', icon: 'i-lucide-shield-check' },
    ],
  },
]

export function useAdminSidebarGroups(): ComputedRef<NavigationMenuItem[][]> {
  const { t } = useI18n()
  const route = useRoute()
  const localePath = useLocalePath()

  return computed(() =>
    GROUPS.map(group => [
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
