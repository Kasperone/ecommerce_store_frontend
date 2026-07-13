import { describe, it, expect } from 'vitest'
import { adminMenuGroups } from './sidebarMenu'

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

  it('exposes 24 routes total across all groups', () => {
    const items = adminMenuGroups.flatMap(g => g.items)
    expect(items).toHaveLength(24)
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
