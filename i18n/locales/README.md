# Internationalization (i18n) Setup

## 📁 Structure

```
i18n/
├── locales/
│   ├── en/
│   │   ├── common.json       # Header, footer, navigation, global actions
│   │   ├── home.json         # Home page specific
│   │   ├── product.json      # Product pages
│   │   └── cart.json         # Shopping cart
│   └── pl/
│       ├── common.json
│       ├── home.json
│       ├── product.json
│       └── cart.json
└── README.md
```

## 🌍 Supported Locales

- **English (en)** - Default locale, USD currency
- **Polski (pl)** - Polish, PLN currency

## 💰 Currency Handling

### Number Formats

Configured in `nuxt.config.ts`:

```typescript
numberFormats: {
  en: {
    currency: { style: 'currency', currency: 'USD' }
  },
  pl: {
    currency: { style: 'currency', currency: 'PLN' }
  }
}
```

### Usage

**In templates:**
```vue
<!-- Using $n helper -->
<p>{{ $n(99.99, 'currency') }}</p>
<!-- EN: $99.99 -->
<!-- PL: 99,99 zł -->
```

**In script:**
```typescript
const { n } = useI18n()
const price = n(99.99, 'currency')

// Or using composable
const { formatPrice } = useCurrency()
const formatted = formatPrice(99.99)

// Format with specific currency (e.g., EUR)
const eurPrice = formatPrice(99.99, 'EUR')
// Result: €99.99

// Get all available currencies
const { availableCurrencies } = useCurrency()
// [{ code: 'USD', symbol: '$' }, { code: 'PLN', symbol: 'zł' }, { code: 'EUR', symbol: '€' }]
```

### Backend Integration

Backend should return prices in appropriate currency:

```json
{
  "product": "Laptop",
  "prices": {
    "USD": 999.99,
    "PLN": 3999.99
  }
}
```

Frontend formats the price based on user locale.

## 📝 Translation Keys Structure

### Common Module (`common.json`)
- `header.*` - Header navigation
- `footer.*` - Footer links
- `navigation.*` - Main navigation
- `actions.*` - Global actions (save, cancel, etc.)
- `messages.*` - Global messages

### Home Module (`home.json`)
- `hero.*` - Hero section
- `features.*` - Feature cards
- `cta.*` - Call to action buttons
- `api.*` - API status messages

### Product Module (`product.json`)
- `details.*` - Product details
- `actions.*` - Product actions
- `stock.*` - Stock status
- `filters.*` - Filtering options

### Cart Module (`cart.json`)
- `summary.*` - Cart summary
- `actions.*` - Cart actions
- `item.*` - Cart item properties
- `messages.*` - Cart messages

## 🔧 Adding New Translations

### 1. Add new module file:

```bash
# English
touch i18n/locales/en/checkout.json

# Polish
touch i18n/locales/pl/checkout.json
```

### 2. Update `nuxt.config.ts`:

```typescript
i18n: {
  locales: [
    {
      code: 'en',
      files: [
        'en/common.json',
        'en/home.json',
        'en/product.json',
        'en/cart.json',
        'en/checkout.json'  // Add new module
      ]
    }
  ]
}
```

### 3. Use in components:

```vue
<template>
  <p>{{ t('checkout.shippingAddress') }}</p>
</template>
```

## 🌐 Adding New Locale

### 1. Create locale folder:

```bash
mkdir -p i18n/locales/de
```

### 2. Copy and translate files:

```bash
cp i18n/locales/en/* i18n/locales/de/
# Translate all JSON files
```

### 3. Add to `nuxt.config.ts`:

```typescript
i18n: {
  locales: [
    { code: 'en', iso: 'en-US', name: 'English', files: [...] },
    { code: 'pl', iso: 'pl-PL', name: 'Polski', files: [...] },
    { code: 'de', iso: 'de-DE', name: 'Deutsch', files: [...] }
  ],
  numberFormats: {
    de: {
      currency: { style: 'currency', currency: 'EUR' }
    }
  }
}
```

## 📖 Best Practices

1. **Keep keys semantic**: `product.addToCart` not `buttons.button1`
2. **Use nested structure**: Group related translations
3. **Parameterized messages**: Use `{variable}` for dynamic content
   ```json
   "greeting": "Hello, {name}!"
   ```
4. **Pluralization**: Use i18n plural rules
   ```json
   "items": "No items | 1 item | {count} items"
   ```

## 🔍 Testing Translations

```bash
# Check for missing translations
npm run dev

# Switch locale in browser
# Click language switcher (🇺🇸 EN / 🇵🇱 PL)
```

## 📚 Resources

- [Nuxt i18n Docs](https://i18n.nuxtjs.org/)
- [Vue I18n Guide](https://vue-i18n.intlify.dev/)
- [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
