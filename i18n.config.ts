import { defineI18nConfig } from '#i18n'

export default defineI18nConfig(() => {
  return {
    legacy: false,
    locale: 'en',
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
