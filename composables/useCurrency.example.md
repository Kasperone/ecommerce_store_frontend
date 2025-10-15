# useCurrency Composable - Examples

## Basic Usage

### Display price in current locale currency

```vue
<script setup>
const { formatPrice } = useCurrency()
</script>

<template>
  <!-- Automatically formats based on locale -->
  <p>{{ formatPrice(99.99) }}</p>
  <!-- EN: $99.99 -->
  <!-- PL: 99,99 zł -->
</template>
```

## Multi-Currency Display

### Show price in multiple currencies

```vue
<script setup>
const { formatPrice, availableCurrencies } = useCurrency()

const product = {
  name: 'Laptop',
  prices: {
    USD: 999.99,
    PLN: 3999.99,
    EUR: 899.99
  }
}
</script>

<template>
  <div>
    <h3>{{ product.name }}</h3>
    
    <!-- Show all available prices -->
    <div class="flex gap-4">
      <span v-for="curr in availableCurrencies" :key="curr.code">
        {{ curr.code }}: {{ formatPrice(product.prices[curr.code], curr.code) }}
      </span>
    </div>
    <!-- USD: $999.99 | PLN: 3 999,99 zł | EUR: €899.99 -->
  </div>
</template>
```

## Backend Integration

### API returns prices per currency

```typescript
// API Response
{
  "product": {
    "id": 123,
    "name": "Laptop",
    "prices": {
      "USD": 999.99,
      "PLN": 3999.99,
      "EUR": 899.99
    }
  }
}

// Component
const { formatPrice, getCurrencyCode } = useCurrency()
const { data: product } = await useFetch('/api/products/123')

// Display price in user's currency
const userCurrency = getCurrencyCode()
const price = formatPrice(product.prices[userCurrency])
```

## E-commerce Example

### Product card with currency selector

```vue
<script setup>
const { formatPrice, currentCurrency, availableCurrencies } = useCurrency()
const selectedCurrency = ref(currentCurrency.value.code)

const product = {
  name: 'MacBook Pro',
  prices: {
    USD: 1999,
    PLN: 7999,
    EUR: 1799
  }
}

const displayPrice = computed(() => {
  return formatPrice(product.prices[selectedCurrency.value], selectedCurrency.value)
})
</script>

<template>
  <UCard>
    <h3>{{ product.name }}</h3>
    
    <!-- Currency Selector -->
    <USelect
      v-model="selectedCurrency"
      :options="availableCurrencies"
      option-label="name"
      option-value="code"
    />
    
    <!-- Price -->
    <p class="text-2xl font-bold">{{ displayPrice }}</p>
    
    <UButton>Add to Cart</UButton>
  </UCard>
</template>
```

## Using with i18n $n helper

### Direct template usage

```vue
<template>
  <!-- Uses locale's default currency -->
  <p>{{ $n(99.99, 'currency') }}</p>
  
  <!-- Or with specific locale -->
  <p>{{ $n(99.99, 'currency', 'pl') }}</p>
  <!-- 99,99 zł -->
</template>
```

## Currency Conversion (Backend-handled)

```typescript
// Backend API should handle conversion
// Frontend just displays

// Making API request with currency preference
const { getCurrencyCode } = useCurrency()

const { data } = await $fetch('/api/products', {
  params: {
    currency: getCurrencyCode() // 'USD', 'PLN', or 'EUR'
  }
})

// Backend returns prices already converted
// Frontend formats for display
const formattedPrices = data.products.map(p => ({
  ...p,
  displayPrice: formatPrice(p.price, p.currency)
}))
```

## Best Practices

1. **Backend returns prices per currency** - Don't do conversion in frontend
2. **Use formatPrice() for display** - Consistent formatting
3. **Store prices in cents/grosze** - Avoid floating point issues
4. **Always specify currency** - When showing non-default currency

## Notes

- Exchange rates are handled by backend
- Frontend only formats display
- All currencies use Intl.NumberFormat for proper localization
- Supports any currency code (ISO 4217)
