import { describe, it, expect } from 'vitest'
import { adminMenuGroups, visibleAdminMenuGroups } from './sidebarMenu'

describe('adminMenuGroups (constant)', () => {
  it('lists exactly the six groups in fixed order', () => {
    expect(adminMenuGroups.map(g => g.key)).toEqual([
      'overview',
      'catalog',
      'sales',
      'marketing',
      'operations',
      'configuration',
    ])
  })

  it('exposes 26 routes total across all groups', () => {
    const items = adminMenuGroups.flatMap(g => g.items)
    expect(items).toHaveLength(26)
  })

  it('includes the gift-cards route under marketing', () => {
    const marketing = adminMenuGroups.find(g => g.key === 'marketing')!
    expect(marketing.items.map(i => i.to)).toContain('/admin/gift-cards')
  })

  it('includes the draft-orders route under sales', () => {
    const sales = adminMenuGroups.find(g => g.key === 'sales')!
    expect(sales.items.map(i => i.to)).toContain('/admin/draft-orders')
  })

  it('includes the translations route under configuration', () => {
    const configuration = adminMenuGroups.find(g => g.key === 'configuration')!
    expect(configuration.items.map(i => i.to)).toContain('/admin/translations')
  })

  it('includes the segments route under marketing', () => {
    const marketing = adminMenuGroups.find(g => g.key === 'marketing')!
    expect(marketing.items.map(i => i.to)).toContain('/admin/segments')
  })

  it('includes the collections route under catalog', () => {
    const catalog = adminMenuGroups.find(g => g.key === 'catalog')!
    expect(catalog.items.map(i => i.to)).toContain('/admin/collections')
  })

  it('includes the returns route under sales', () => {
    const sales = adminMenuGroups.find(g => g.key === 'sales')!
    expect(sales.items.map(i => i.to)).toContain('/admin/returns')
  })

  it('includes the warehouses route under catalog', () => {
    const catalog = adminMenuGroups.find(g => g.key === 'catalog')!
    expect(catalog.items.map(i => i.to)).toContain('/admin/warehouses')
  })

  it('includes the CMS pages route under marketing', () => {
    const marketing = adminMenuGroups.find(g => g.key === 'marketing')!
    expect(marketing.items.map(i => i.to)).toContain('/admin/pages')
  })

  it('starts every route with /admin', () => {
    const items = adminMenuGroups.flatMap(g => g.items)
    items.forEach(i => expect(i.to.startsWith('/admin')).toBe(true))
  })

  it('keeps every route slug unique', () => {
    const tos = adminMenuGroups.flatMap(g => g.items).map(i => i.to)
    expect(new Set(tos).size).toBe(tos.length)
  })

  it('keeps every i18n key slug unique', () => {
    const keys = adminMenuGroups.flatMap(g => g.items).map(i => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('puts Dashboard at /admin (not /admin/dashboard)', () => {
    const overview = adminMenuGroups.find(g => g.key === 'overview')!
    expect(overview.items[0]).toMatchObject({ key: 'dashboard', to: '/admin' })
  })

  it('assigns a lucide icon to every item', () => {
    const items = adminMenuGroups.flatMap(g => g.items)
    items.forEach(i => expect(i.icon).toMatch(/^i-lucide-/))
  })
})

describe('visibleAdminMenuGroups (capability filtering)', () => {
  const allTos = (groups: { items: { to: string }[] }[]) =>
    groups.flatMap(g => g.items).map(i => i.to)

  it('shows everything to an owner (can() always true)', () => {
    const groups = visibleAdminMenuGroups(() => true)
    expect(allTos(groups)).toHaveLength(26)
    expect(groups.map(g => g.key)).toEqual([
      'overview', 'catalog', 'sales', 'marketing', 'operations', 'configuration',
    ])
  })

  it('a staffer with no capabilities sees only read-only sections', () => {
    const groups = visibleAdminMenuGroups(() => false)
    // Only cap-less items survive: dashboard + reports + audit-log.
    expect(allTos(groups).sort()).toEqual(['/admin', '/admin/audit-log', '/admin/reports'])
    // overview + operations remain; catalog/sales/marketing/configuration vanish.
    expect(groups.map(g => g.key)).toEqual(['overview', 'operations'])
  })

  it('a catalog:write staffer sees catalog write sections + read-only', () => {
    const groups = visibleAdminMenuGroups(cap => cap === 'catalog:write')
    const tos = allTos(groups)
    expect(tos).toContain('/admin/products')
    expect(tos).toContain('/admin/categories')
    expect(tos).toContain('/admin/reviews')
    // Not their capability:
    expect(tos).not.toContain('/admin/inventory') // inventory:write
    expect(tos).not.toContain('/admin/orders') // orders:write
    expect(tos).not.toContain('/admin/staff') // staff:write
    // Read-only still shown:
    expect(tos).toContain('/admin/reports')
  })

  it('orders:refund reveals gift-cards but not orders:write sections', () => {
    const groups = visibleAdminMenuGroups(cap => cap === 'orders:refund')
    const tos = allTos(groups)
    expect(tos).toContain('/admin/gift-cards') // orders:refund
    expect(tos).not.toContain('/admin/orders') // orders:write
  })

  it('drops a group entirely when it has no visible items', () => {
    const groups = visibleAdminMenuGroups(cap => cap === 'staff:write')
    // configuration keeps staff; catalog/sales/marketing fully vanish.
    expect(groups.map(g => g.key)).not.toContain('catalog')
    expect(groups.map(g => g.key)).not.toContain('sales')
    const config = groups.find(g => g.key === 'configuration')!
    expect(config.items.map(i => i.to)).toEqual(['/admin/staff'])
  })
})
