export const API_ENDPOINTS = {
  // Base API URL
  BASE: '/api/v1',
  
  // Health endpoints
  HEALTH: '/health',
  ROOT: '/',
  
  // Authentication endpoints
  AUTH: {
    BASE: '/api/v1/auth',
    LOGIN: '/api/v1/auth/login',      // POST - OAuth2 token login
    REGISTER: '/api/v1/auth/register', // POST - Register new user
    ME: '/api/v1/auth/me',            // GET - Get current user
    UPDATE_ME: '/api/v1/auth/me',     // PUT - Update current user
    REFRESH: '/api/v1/auth/refresh'   // POST - Refresh token
  },
  
  // Products endpoints
  PRODUCTS: {
    BASE: '/api/v1/products',
    LIST: '/api/v1/products/',        // GET - List products with filters & pagination
    FEATURED: '/api/v1/products/featured', // GET - Get featured products
    BY_ID: '/api/v1/products/{id}',   // GET - Get product by ID
    BY_SLUG: '/api/v1/products/slug/{slug}', // GET - Get product by slug
    CREATE: '/api/v1/products/',      // POST - Create product (admin)
    UPDATE: '/api/v1/products/{id}',  // PUT - Update product (admin)
    DELETE: '/api/v1/products/{id}'   // DELETE - Delete product (admin)
  },
  
  // Categories endpoints
  CATEGORIES: {
    BASE: '/api/v1/categories',
    LIST: '/api/v1/categories/',      // GET - List categories with product counts
    BY_ID: '/api/v1/categories/{id}', // GET - Get category by ID
    BY_SLUG: '/api/v1/categories/slug/{slug}', // GET - Get category by slug
    CREATE: '/api/v1/categories/',    // POST - Create category (admin)
    UPDATE: '/api/v1/categories/{id}', // PUT - Update category (admin)
    DELETE: '/api/v1/categories/{id}' // DELETE - Delete category (admin)
  }
} as const

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
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
    API_ENDPOINTS.CATEGORIES.DELETE.replace('{id}', String(id))
} as const

/**
 * Named exports for convenience
 */
export const AUTH_ENDPOINTS = API_ENDPOINTS.AUTH
export const PRODUCTS_ENDPOINTS = API_ENDPOINTS.PRODUCTS
export const CATEGORIES_ENDPOINTS = API_ENDPOINTS.CATEGORIES
