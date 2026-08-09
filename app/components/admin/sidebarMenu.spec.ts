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

  it('exposes 28 routes total across all groups', () => {
    const items = adminMenuGroups.flatMap(g => g.items)
    expect(items).toHaveLength(28)
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

  /**
   * Build a `can()` over an **effective** capability set — what `/auth/me`
   * returns in `effective_capabilities`, i.e. the grants already expanded by
   * the backend's implication closure. Never pass a raw grant here: the
   * expansion table is backend-only by design, so a test that hands
   * `visibleAdminMenuGroups` a bare `catalog:write` is testing a state the
   * runtime never produces, and would let a write→read regression pass.
   */
  const canFrom = (...effective: string[]) => (cap: string) => effective.includes(cap)

  it('shows everything to an owner (can() always true)', () => {
    const groups = visibleAdminMenuGroups(() => true)
    expect(allTos(groups)).toHaveLength(28)
    expect(groups.map(g => g.key)).toEqual([
      'overview', 'catalog', 'sales', 'marketing', 'operations', 'configuration',
    ])
  })

  it('a staffer with no capabilities sees nothing at all', () => {
    const groups = visibleAdminMenuGroups(() => false)
    // Every item carries a cap since SEC-021 — the dashboard, reports and
    // audit log used to survive here as "read-only sections", but admin reads
    // are capability-scoped now and those three 403 without reports:read /
    // audit:read. Showing them was showing links that error.
    expect(allTos(groups)).toEqual([])
    expect(groups).toEqual([])
  })

  it('the standalone reads gate the dashboard, reports and audit log', () => {
    // reports:read and audit:read are implied by NO write capability, so they
    // are the only way those three surfaces appear.
    const reports = visibleAdminMenuGroups(canFrom('reports:read'))
    expect(allTos(reports).sort()).toEqual(['/admin', '/admin/reports'])

    const audit = visibleAdminMenuGroups(canFrom('audit:read'))
    expect(allTos(audit)).toEqual(['/admin/audit-log'])
  })

  it('a catalog:write staffer sees the catalog sections', () => {
    // Effective set for `catalog:write`: the write itself, its own domain read,
    // and tax:read through it (the per-product VAT picker).
    const groups = visibleAdminMenuGroups(canFrom('catalog:write', 'catalog:read', 'tax:read'))
    const tos = allTos(groups)
    expect(tos).toContain('/admin/products')
    expect(tos).toContain('/admin/categories')
    expect(tos).toContain('/admin/reviews')
    expect(tos).toContain('/admin/tax') // reachable, so it is linked
    // Not their capability:
    expect(tos).not.toContain('/admin/inventory') // inventory:read
    expect(tos).not.toContain('/admin/orders') // orders:read
    expect(tos).not.toContain('/admin/staff') // staff:read
    // The dashboard and reports are NOT thrown in: reports:read is standalone,
    // so no write capability implies it. This is the SEC-021 tightening.
    expect(tos).not.toContain('/admin/reports')
    expect(tos).not.toContain('/admin')
  })

  it('a read-only catalog grant reveals the same catalog sections', () => {
    // The regression this file exists for. Read caps are grantable in the staff
    // editor, so `catalog:read` with no write is a real staffer — and the API
    // serves them every catalog GET. Gating the menu on `catalog:write` hid all
    // of it from them with no error at all.
    const groups = visibleAdminMenuGroups(canFrom('catalog:read', 'tax:read'))
    const tos = allTos(groups)
    expect(tos).toEqual([
      '/admin/products',
      '/admin/categories',
      '/admin/collections',
      '/admin/reviews',
      '/admin/tax',
    ])
  })

  it('a read-only orders grant reveals every orders surface', () => {
    // Effective set for `orders:read`: companies + shipping come with it —
    // the quote composer picks a company, the draft-order detail prices from
    // the shipping methods, and both are readable, so both are linked.
    const groups = visibleAdminMenuGroups(canFrom('orders:read', 'companies:read', 'shipping:read'))
    const tos = allTos(groups)
    expect(tos).toContain('/admin/orders')
    expect(tos).toContain('/admin/draft-orders')
    expect(tos).toContain('/admin/returns')
    expect(tos).toContain('/admin/quotes')
    expect(tos).toContain('/admin/gift-cards') // reads on orders:read, writes on orders:refund
    expect(tos).toContain('/admin/companies')
    expect(tos).toContain('/admin/shipping')
    // Still finer than the write half — no customer database, no store config.
    expect(tos).not.toContain('/admin/customers')
    expect(tos).not.toContain('/admin/settings')
  })

  it('a read-only customers grant reveals customers and companies, not the catalog', () => {
    const groups = visibleAdminMenuGroups(canFrom('customers:read', 'companies:read'))
    const tos = allTos(groups)
    expect(tos).toContain('/admin/customers')
    expect(tos).toContain('/admin/segments')
    expect(tos).toContain('/admin/companies')
    expect(tos).toContain('/admin/price-lists')
    expect(tos).toContain('/admin/payment-terms')
    expect(tos).not.toContain('/admin/products')
    expect(tos).not.toContain('/admin/orders')
  })

  it('a read-only content grant reveals only the CMS pages', () => {
    const groups = visibleAdminMenuGroups(canFrom('content:read'))
    expect(allTos(groups)).toEqual(['/admin/pages'])
  })

  it('a read-only marketing grant reveals coupons, banners and campaigns', () => {
    const groups = visibleAdminMenuGroups(canFrom('marketing:read'))
    expect(allTos(groups).sort()).toEqual([
      '/admin/banners',
      '/admin/campaigns',
      '/admin/coupons',
    ])
    // gift-cards sits in the same group but reads on orders:read.
    expect(allTos(groups)).not.toContain('/admin/gift-cards')
  })

  it('settings:read reveals settings and translations but not tax', () => {
    // The two config surfaces the settings router actually serves. Tax has its
    // own read cap — settings:read reaches the tax *API* transitively, but the
    // page is linked from the cap its own router declares.
    const groups = visibleAdminMenuGroups(canFrom('settings:read'))
    expect(allTos(groups).sort()).toEqual(['/admin/settings', '/admin/translations'])
  })

  it('orders:refund reveals gift-cards and the orders surfaces it can read', () => {
    // `orders:refund` implies `orders:read`, so the whole orders read surface
    // is served to them and the menu says so.
    const groups = visibleAdminMenuGroups(
      canFrom('orders:refund', 'orders:read', 'companies:read', 'shipping:read'),
    )
    const tos = allTos(groups)
    expect(tos).toContain('/admin/gift-cards')
    expect(tos).toContain('/admin/orders')
    expect(tos).not.toContain('/admin/products')
  })

  it('drops a group entirely when it has no visible items', () => {
    const groups = visibleAdminMenuGroups(canFrom('staff:write', 'staff:read'))
    // configuration keeps staff; catalog/sales/marketing fully vanish.
    expect(groups.map(g => g.key)).not.toContain('catalog')
    expect(groups.map(g => g.key)).not.toContain('sales')
    const config = groups.find(g => g.key === 'configuration')!
    expect(config.items.map(i => i.to)).toEqual(['/admin/staff'])
  })

  it('no entry gates on a write capability', () => {
    // The structural guard. A `<domain>:write` cap here would be invisible to a
    // read-only staffer the API serves — and nothing else in the build catches
    // it, because write-implies-read keeps every existing grant working.
    const caps = adminMenuGroups.flatMap(g => g.items).map(i => i.cap)
    expect(caps.filter(c => !c?.endsWith(':read'))).toEqual([])
  })
})
