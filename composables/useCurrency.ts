/**
 * Currency composable using i18n numberFormats
 * 
 * Usage:
 * 1. Display price from backend (already in correct currency):
 *    const { formatPrice } = useCurrency()
 *    formatPrice(product.price, product.currency)
 * 
 * 2. Use with i18n $n helper:
 *    {{ $n(product.price, 'currency') }}
 */
export const useCurrency = () => {
  const { locale, n } = useI18n()
  
  // Currency codes per locale
  const currencies = {
    en: { code: 'USD', symbol: '$' },
    pl: { code: 'PLN', symbol: 'zł' },
  }
  
  // All available currencies
  const availableCurrencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'PLN', symbol: 'zł', name: 'Polish Złoty' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
  ]
  
  const currentCurrency = computed(() => {
    return currencies[locale.value as keyof typeof currencies] || currencies.en
  })
  
  /**
   * Format price using i18n number formats
   * Backend should return prices in appropriate currency per locale
   * 
   * @param price - Price amount
   * @param currency - Optional currency code (defaults to locale currency)
   */
  const formatPrice = (price: number, currency?: string) => {
    if (currency && currency !== currentCurrency.value.code) {
      // Format with specific currency (for multi-currency display)
      return new Intl.NumberFormat(locale.value, {
        style: 'currency',
        currency: currency,
      }).format(price)
    }
    
    // Use i18n numberFormats (recommended)
    return n(price, 'currency')
  }
  
  /**
   * Get currency code for current locale
   * Use this when making API requests
   */
  const getCurrencyCode = () => currentCurrency.value.code
  
  return {
    currentCurrency,
    availableCurrencies,
    formatPrice,
    getCurrencyCode,
  }
}
