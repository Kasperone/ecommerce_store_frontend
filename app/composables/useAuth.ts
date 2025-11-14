import { AUTH_ENDPOINTS } from '~/shared/constants/api'
import type { 
  PersonalSignUpFormData, 
  BusinessSignUpFormData 
} from '~/shared/validators/auth'

interface UserResponse {
  email: string
  first_name: string
  last_name: string
  phone: string
  is_active: boolean
  is_verified: boolean
  role: 'CUSTOMER' | 'ADMIN'
  created_at: string
  updated_at: string
  
  // Shipping address (optional)
  shipping_street?: string | null
  shipping_city?: string | null
  shipping_postal_code?: string | null
  shipping_country?: string | null
  shipping_state?: string | null
  
  // Company data (optional)
  company_name?: string | null
  company_tax_id?: string | null
  company_address_street?: string | null
  company_address_city?: string | null
  company_address_postal_code?: string | null
  company_address_country?: string | null
  company_address_state?: string | null
}

interface TokenResponse {
  access_token: string
  token_type: string
}

interface ApiError {
  detail: string
}

export const useAuth = () => {
  const { apiFetch } = useApi()
  const authToken = useCookie('auth_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  })
  const user = useState<UserResponse | null>('user', () => null)

  const register = async (data: PersonalSignUpFormData | BusinessSignUpFormData) => {
    try {
      const response = await apiFetch<UserResponse>(AUTH_ENDPOINTS.REGISTER, {
        method: 'POST',
        body: {
          email: data.email,
          password: data.password,
          first_name: data.firstName,
          last_name: data.lastName,
          phone: data.phone,
          
          // Personal account - shipping address
          ...('shippingStreet' in data && data.shippingStreet ? {
            shipping_street: data.shippingStreet,
            shipping_city: data.shippingCity,
            shipping_postal_code: data.shippingPostalCode,
            shipping_country: data.shippingCountry,
            shipping_state: data.shippingState || null
          } : {}),
          
          // Business account - company data
          ...('companyName' in data && data.companyName ? {
            company_name: data.companyName,
            company_tax_id: data.companyTaxId,
            company_address_street: data.companyAddressStreet,
            company_address_city: data.companyAddressCity,
            company_address_postal_code: data.companyAddressPostalCode,
            company_address_country: data.companyAddressCountry,
            company_address_state: data.companyAddressState || null
          } : {})
        }
      })

      user.value = response
      return { success: true, data: response }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return { 
        success: false, 
        error: apiError?.detail || 'Registration failed. Please try again.' 
      }
    }
  }

  const login = async (email: string, password: string) => {
    try {
      // FastAPI uses OAuth2PasswordRequestForm which expects form data
      const formData = new FormData()
      formData.append('username', email) // OAuth2 uses 'username' field
      formData.append('password', password)

      const response = await apiFetch<TokenResponse>(AUTH_ENDPOINTS.LOGIN, {
        method: 'POST',
        body: formData
      })

      authToken.value = response.access_token
      
      // Fetch user info after successful login
      await fetchUser()
      
      return { success: true, data: response }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return { 
        success: false, 
        error: apiError?.detail || 'Login failed. Please check your credentials.' 
      }
    }
  }

  const logout = () => {
    authToken.value = null
    user.value = null
  }

  const fetchUser = async () => {
    if (!authToken.value) {
      user.value = null
      return
    }

    try {
      const response = await apiFetch<UserResponse>(AUTH_ENDPOINTS.ME, {
        method: 'GET'
      })
      user.value = response
    } catch (error) {
      // Token might be invalid
      authToken.value = null
      user.value = null
    }
  }

  const refreshToken = async () => {
    if (!authToken.value) return

    try {
      const response = await apiFetch<TokenResponse>(AUTH_ENDPOINTS.REFRESH, {
        method: 'POST'
      })
      authToken.value = response.access_token
    } catch (error) {
      // Refresh failed, user needs to login again
      authToken.value = null
      user.value = null
    }
  }

  const isAuthenticated = computed(() => !!authToken.value && !!user.value)

  return {
    user: readonly(user),
    isAuthenticated,
    register,
    login,
    logout,
    fetchUser,
    refreshToken
  }
}
