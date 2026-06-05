import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { plPluralIndex } from './plPlural'

// Index meaning under our four-form convention: 0 = zero, 1 = one, 2 = few,
// 3 = many.
describe('plPluralIndex', () => {
  it('returns the zero slot for count 0', () => {
    expect(plPluralIndex(0, 4)).toBe(0)
  })

  it('returns "one" only for exactly 1', () => {
    expect(plPluralIndex(1, 4)).toBe(1)
    // 21/31/101 are "many" in Polish (unlike Russian, where they are "one").
    expect(plPluralIndex(21, 4)).toBe(3)
    expect(plPluralIndex(101, 4)).toBe(3)
  })

  it('returns "few" for counts ending 2–4 outside the 12–14 teens', () => {
    for (const n of [2, 3, 4, 22, 23, 24, 102, 104]) {
      expect(plPluralIndex(n, 4)).toBe(2)
    }
  })

  it('returns "many" for 5–21, the 12–14 teens, and counts ending 0/1/5–9', () => {
    for (const n of [5, 6, 9, 10, 11, 12, 13, 14, 15, 20, 21, 25, 100]) {
      expect(plPluralIndex(n, 4)).toBe(3)
    }
  })

  it('clamps to the last form when a string carries fewer than four forms', () => {
    // 3-form string: few/many both fold onto the last slot (index 2).
    expect(plPluralIndex(2, 3)).toBe(2)
    expect(plPluralIndex(5, 3)).toBe(2)
    // 2-form string: anything past "one" folds onto index 1.
    expect(plPluralIndex(2, 2)).toBe(1)
    expect(plPluralIndex(5, 2)).toBe(1)
  })
})

// End-to-end through vue-i18n with the real four-form strings, so a future
// edit to the rule or the strings that breaks selection is caught here.
describe('Polish plural selection via vue-i18n', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'pl',
    pluralRules: { pl: plPluralIndex },
    messages: {
      pl: {
        orders:
          '{count} zamówień | {count} zamówienie | {count} zamówienia | {count} zamówień',
        reviews: 'Brak opinii | {count} opinia | {count} opinie | {count} opinii',
      },
    },
  })
  const t = i18n.global.t

  it('selects one/few/many for a count-bearing string', () => {
    expect(t('orders', { count: 1 })).toBe('1 zamówienie')
    expect(t('orders', { count: 2 })).toBe('2 zamówienia')
    expect(t('orders', { count: 5 })).toBe('5 zamówień')
    expect(t('orders', { count: 22 })).toBe('22 zamówienia')
    expect(t('orders', { count: 25 })).toBe('25 zamówień')
  })

  it('uses the zero slot as a standalone message for review strings', () => {
    expect(t('reviews', { count: 0 })).toBe('Brak opinii')
    expect(t('reviews', { count: 1 })).toBe('1 opinia')
    expect(t('reviews', { count: 3 })).toBe('3 opinie')
    expect(t('reviews', { count: 5 })).toBe('5 opinii')
  })
})
