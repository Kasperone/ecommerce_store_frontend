import { defineI18nConfig } from '#i18n'
import { plPluralIndex } from '#shared/utils/plPlural'

export default defineI18nConfig(() => {
  return {
    legacy: false,
    locale: 'en',
    // Polish CLDR plural selection. vue-i18n's default rule only supports
    // one/other, so Polish 3-form strings mis-select (e.g. count 1 lands on the
    // "few" form). EN is intentionally omitted — it keeps the built-in rule.
    // PL plural strings carry four forms: zero | one | few | many. "one" is
    // *exactly* 1 (not 21, unlike Russian); the zero slot lets review strings
    // show a "Brak opinii" message at count 0 while count-bearing strings just
    // repeat the genitive ("many") form there.
    pluralRules: {
      pl: plPluralIndex,
    },
    // Number formats for currency
    numberFormats: {
      en: {
        currency: {
          style: 'currency',
          currency: 'USD',
          notation: 'standard',
        },
        decimal: {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      },
      pl: {
        currency: {
          style: 'currency',
          currency: 'PLN',
          notation: 'standard',
        },
        decimal: {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      },
      // EUR support (can be used with any locale)
      eur: {
        currency: {
          style: 'currency',
          currency: 'EUR',
          notation: 'standard',
        },
        decimal: {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      },
    },
  }
})
