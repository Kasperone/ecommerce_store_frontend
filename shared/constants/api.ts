export const API_ENDPOINTS = {
  // Base API URL
  BASE: '/api/v1',

  // Health endpoints
  HEALTH: '/health',
  ROOT: '/',

  // Authentication endpoints
  AUTH: {
    BASE: '/api/v1/auth',
    LOGIN: '/api/v1/auth/login', // POST - OAuth2 token login
    REGISTER: '/api/v1/auth/register', // POST - Register new user
    REGISTER_BUSINESS: '/api/v1/auth/register-business', // POST - B2B self-signup (user + pending company)
    ME: '/api/v1/auth/me', // GET - Get current user
    UPDATE_ME: '/api/v1/auth/me', // PUT - Update current user
    REFRESH: '/api/v1/auth/refresh', // POST - Rotate refresh cookie + new access token
    REFRESH_SSR: '/api/v1/auth/refresh/ssr', // POST - SSR-only: validate cookie + mint access WITHOUT rotating (X-SSR-Secret gated)
    LOGOUT: '/api/v1/auth/logout', // POST - Revoke current refresh + clear cookie
    LOGOUT_ALL: '/api/v1/auth/logout-all', // POST - Revoke every session for current user
    PASSWORD_RESET_REQUEST: '/api/v1/auth/password-reset/request', // POST - Request reset email
    PASSWORD_RESET_CONFIRM: '/api/v1/auth/password-reset/confirm', // POST - Confirm reset with token
    CHANGE_PASSWORD: '/api/v1/auth/change-password', // POST - Authenticated password change
  },

  // Products endpoints
  PRODUCTS: {
    BASE: '/api/v1/products',
    LIST: '/api/v1/products/', // GET - List products with filters & pagination
    FEATURED: '/api/v1/products/featured', // GET - Get featured products
    BY_ID: '/api/v1/products/{id}', // GET - Get product by ID
    BY_SLUG: '/api/v1/products/slug/{slug}', // GET - Get product by slug
    CREATE: '/api/v1/products/', // POST - Create product (admin)
    UPDATE: '/api/v1/products/{id}', // PUT - Update product (admin)
    DELETE: '/api/v1/products/{id}', // DELETE - Delete product (admin)
    OPTIONS_MATRIX: '/api/v1/products/{id}/options', // PUT - Reconcile options/variants matrix (admin)
    VARIANTS: '/api/v1/products/{id}/variants', // GET - List variants incl. inactive (admin)
    VARIANT_BY_ID: '/api/v1/products/{id}/variants/{variantId}', // PATCH/DELETE - Single variant (admin)
  },

  // Categories endpoints
  CATEGORIES: {
    BASE: '/api/v1/categories',
    LIST: '/api/v1/categories/', // GET - List categories with product counts
    BY_ID: '/api/v1/categories/{id}', // GET - Get category by ID
    BY_SLUG: '/api/v1/categories/slug/{slug}', // GET - Get category by slug
    CREATE: '/api/v1/categories/', // POST - Create category (admin)
    UPDATE: '/api/v1/categories/{id}', // PUT - Update category (admin)
    DELETE: '/api/v1/categories/{id}', // DELETE - Delete category (admin)
  },

  // Product-tag vocabulary (admin-gated). Distinct from customer tags — see
  // the customer-tag routes under /admin/tags. Trailing slash on the list
  // route (FastAPI 307s the slashless form through the h3 proxy).
  PRODUCT_TAGS: {
    BASE: '/api/v1/admin/product-tags',
    LIST: '/api/v1/admin/product-tags/', // GET - Vocabulary list with usage counts
    CREATE: '/api/v1/admin/product-tags/', // POST - Create a vocabulary tag (admin)
    UPDATE: '/api/v1/admin/product-tags/{id}', // PATCH - Rename/recolor (admin)
    DELETE: '/api/v1/admin/product-tags/{id}', // DELETE - Cascade delete (admin)
  },

  // Manual collections (admin-gated CRUD + hero + ordered membership).
  COLLECTIONS: {
    BASE: '/api/v1/admin/collections',
    LIST: '/api/v1/admin/collections/', // GET - List with product counts (admin)
    BY_ID: '/api/v1/admin/collections/{id}', // GET - Get one by id (admin)
    CREATE: '/api/v1/admin/collections/', // POST - Create collection (admin)
    UPDATE: '/api/v1/admin/collections/{id}', // PUT - Update collection (admin)
    DELETE: '/api/v1/admin/collections/{id}', // DELETE - Delete collection (admin)
    SET_PRODUCTS: '/api/v1/admin/collections/{id}/products', // PUT - Replace membership (ordered)
    PRODUCT: '/api/v1/admin/collections/{id}/products/{productId}', // POST/DELETE - Single add/remove
    HERO: '/api/v1/admin/collections/{id}/hero', // POST/PATCH/DELETE - Hero image
    // Public reads (storefront, PR-F2): list active + detail by slug.
    PUBLIC_LIST: '/api/v1/collections/', // GET - Active collections with counts
    PUBLIC_BY_SLUG: '/api/v1/collections/slug/{slug}', // GET - Detail by EN/PL slug
  },

  // Search endpoints (backend-proxied Meilisearch; 503 when unconfigured)
  SEARCH: {
    QUERY: '/api/v1/search', // GET - Faceted product search
    SUGGEST: '/api/v1/search/suggest', // GET - Mixed autocomplete (products + categories)
  },

  // Admin draft orders — compose an order before conversion. Trailing slash
  // on the collection routes (FastAPI 307s the slashless form through the h3
  // proxy). Item mutations return the FULL updated draft.
  DRAFT_ORDERS: {
    BASE: '/api/v1/admin/draft-orders',
    LIST: '/api/v1/admin/draft-orders/', // GET - Paginated list with status filter (admin)
    CREATE: '/api/v1/admin/draft-orders/', // POST - Create empty draft with pinned currency (admin)
    BY_ID: '/api/v1/admin/draft-orders/{id}', // GET/PATCH/DELETE - One draft, header edits (admin)
    ITEMS: '/api/v1/admin/draft-orders/{id}/items', // POST - Add a catalog line (admin)
    ITEM_BY_ID: '/api/v1/admin/draft-orders/{id}/items/{itemId}', // PATCH/DELETE - One line (admin)
    CONVERT: '/api/v1/admin/draft-orders/{id}/convert', // POST - Convert an open draft into a real order (admin)
  },

  // Orders endpoints (customer-facing subset; admin flows live in the queries layer)
  ORDERS: {
    BASE: '/api/v1/orders',
    CREATE: '/api/v1/orders/', // POST - Authed or guest (guest_email + locale required when anonymous)
    TRACK: '/api/v1/orders/track/{token}', // GET - Public account-less order tracking (rate-limited, 404 on unknown token)
  },

  // Payments endpoints. The three checkout-start POSTs accept an optional
  // `?guest_token=` query param so a guest order (no bearer) can start payment.
  PAYMENTS: {
    PAYU_CHECKOUT: '/api/v1/payments/payu/orders/{orderId}', // POST - Start PayU hosted checkout
    STRIPE_CHECKOUT: '/api/v1/payments/stripe/checkout/{orderId}', // POST - Start Stripe hosted checkout
    STRIPE_PAYMENT_INTENT: '/api/v1/payments/stripe/payment-intent/{orderId}', // POST - Create wallet PaymentIntent
    STRIPE_CONFIG: '/api/v1/payments/stripe/config', // GET - Public browser config (publishable key)
  },
} as const

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const

/**
 * Helper functions to build API URLs with parameters
 */
export const buildApiUrl = {
  /**
   * Build product URL by ID
   * @param id Product ID
   */
  productById: (id: number | string) =>
    API_ENDPOINTS.PRODUCTS.BY_ID.replace('{id}', String(id)),

  /**
   * Build product URL by slug
   * @param slug Product slug
   */
  productBySlug: (slug: string) =>
    API_ENDPOINTS.PRODUCTS.BY_SLUG.replace('{slug}', slug),

  /**
   * Build category URL by ID
   * @param id Category ID
   */
  categoryById: (id: number | string) =>
    API_ENDPOINTS.CATEGORIES.BY_ID.replace('{id}', String(id)),

  /**
   * Build category URL by slug
   * @param slug Category slug
   */
  categoryBySlug: (slug: string) =>
    API_ENDPOINTS.CATEGORIES.BY_SLUG.replace('{slug}', slug),

  /**
   * Build update product URL
   * @param id Product ID
   */
  updateProduct: (id: number | string) =>
    API_ENDPOINTS.PRODUCTS.UPDATE.replace('{id}', String(id)),

  /**
   * Build delete product URL
   * @param id Product ID
   */
  deleteProduct: (id: number | string) =>
    API_ENDPOINTS.PRODUCTS.DELETE.replace('{id}', String(id)),

  /**
   * Build the options/variants matrix URL (PUT)
   * @param id Product ID
   */
  productOptionsMatrix: (id: number | string) =>
    API_ENDPOINTS.PRODUCTS.OPTIONS_MATRIX.replace('{id}', String(id)),

  /**
   * Build the admin variants list URL (GET)
   * @param id Product ID
   */
  productVariants: (id: number | string) =>
    API_ENDPOINTS.PRODUCTS.VARIANTS.replace('{id}', String(id)),

  /**
   * Build a single-variant URL (PATCH/DELETE)
   * @param id Product ID
   * @param variantId Variant ID
   */
  productVariantById: (id: number | string, variantId: number | string) =>
    API_ENDPOINTS.PRODUCTS.VARIANT_BY_ID
      .replace('{id}', String(id))
      .replace('{variantId}', String(variantId)),

  /**
   * Build update category URL
   * @param id Category ID
   */
  updateCategory: (id: number | string) =>
    API_ENDPOINTS.CATEGORIES.UPDATE.replace('{id}', String(id)),

  /**
   * Build delete category URL
   * @param id Category ID
   */
  deleteCategory: (id: number | string) =>
    API_ENDPOINTS.CATEGORIES.DELETE.replace('{id}', String(id)),

  /**
   * Build the public guest order-tracking URL (GET)
   * @param token Opaque guest tracking token (43-char urlsafe)
   */
  orderTrack: (token: string) =>
    API_ENDPOINTS.ORDERS.TRACK.replace('{token}', encodeURIComponent(token)),

  /**
   * Build the PayU checkout-start URL (POST; add `?guest_token=` for guest orders)
   * @param orderId Order ID
   */
  payuCheckout: (orderId: number | string) =>
    API_ENDPOINTS.PAYMENTS.PAYU_CHECKOUT.replace('{orderId}', String(orderId)),

  /**
   * Build the Stripe hosted-checkout-start URL (POST; add `?guest_token=` for guest orders)
   * @param orderId Order ID
   */
  stripeCheckout: (orderId: number | string) =>
    API_ENDPOINTS.PAYMENTS.STRIPE_CHECKOUT.replace('{orderId}', String(orderId)),

  /**
   * Build the Stripe PaymentIntent URL (POST; add `?guest_token=` for guest orders)
   * @param orderId Order ID
   */
  stripePaymentIntent: (orderId: number | string) =>
    API_ENDPOINTS.PAYMENTS.STRIPE_PAYMENT_INTENT.replace('{orderId}', String(orderId)),

  /**
   * Build a product-tag URL by ID (PATCH/DELETE)
   * @param id Product-tag ID
   */
  productTagById: (id: number | string) =>
    API_ENDPOINTS.PRODUCT_TAGS.UPDATE.replace('{id}', String(id)),

  /**
   * Build an admin collection URL by ID (GET/PUT/DELETE)
   * @param id Collection ID
   */
  collectionById: (id: number | string) =>
    API_ENDPOINTS.COLLECTIONS.BY_ID.replace('{id}', String(id)),

  /**
   * Build the collection membership-set URL (PUT { product_ids })
   * @param id Collection ID
   */
  collectionProducts: (id: number | string) =>
    API_ENDPOINTS.COLLECTIONS.SET_PRODUCTS.replace('{id}', String(id)),

  /**
   * Build a single collection-member URL (POST/DELETE)
   * @param id Collection ID
   * @param productId Product ID
   */
  collectionProduct: (id: number | string, productId: number | string) =>
    API_ENDPOINTS.COLLECTIONS.PRODUCT
      .replace('{id}', String(id))
      .replace('{productId}', String(productId)),

  /**
   * Build the collection hero URL (POST/PATCH/DELETE)
   * @param id Collection ID
   */
  collectionHero: (id: number | string) =>
    API_ENDPOINTS.COLLECTIONS.HERO.replace('{id}', String(id)),

  /**
   * Build the public collection-by-slug URL (GET)
   * @param slug Collection slug (EN or PL)
   */
  collectionBySlug: (slug: string) =>
    API_ENDPOINTS.COLLECTIONS.PUBLIC_BY_SLUG.replace('{slug}', slug),

  /**
   * Build a draft-order URL by ID (GET/PATCH/DELETE)
   * @param id Draft order ID
   */
  draftOrderById: (id: number | string) =>
    API_ENDPOINTS.DRAFT_ORDERS.BY_ID.replace('{id}', String(id)),

  /**
   * Build the draft-order items collection URL (POST)
   * @param id Draft order ID
   */
  draftOrderItems: (id: number | string) =>
    API_ENDPOINTS.DRAFT_ORDERS.ITEMS.replace('{id}', String(id)),

  /**
   * Build a single draft-order item URL (PATCH/DELETE)
   * @param id Draft order ID
   * @param itemId Draft order item ID
   */
  draftOrderItemById: (id: number | string, itemId: number | string) =>
    API_ENDPOINTS.DRAFT_ORDERS.ITEM_BY_ID
      .replace('{id}', String(id))
      .replace('{itemId}', String(itemId)),

  /**
   * Build the draft-order convert URL (POST)
   * @param id Draft order ID
   */
  draftOrderConvert: (id: number | string) =>
    API_ENDPOINTS.DRAFT_ORDERS.CONVERT.replace('{id}', String(id)),
} as const

/**
 * Named exports for convenience
 */
export const AUTH_ENDPOINTS = API_ENDPOINTS.AUTH
export const PRODUCTS_ENDPOINTS = API_ENDPOINTS.PRODUCTS
export const CATEGORIES_ENDPOINTS = API_ENDPOINTS.CATEGORIES
export const PRODUCT_TAGS_ENDPOINTS = API_ENDPOINTS.PRODUCT_TAGS
export const COLLECTIONS_ENDPOINTS = API_ENDPOINTS.COLLECTIONS
