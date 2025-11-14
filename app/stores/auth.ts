import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { AUTH_ENDPOINTS } from '#shared/constants/api'
import type { 
  PersonalSignUpFormData, 
  BusinessSignUpFormData 
} from '#shared/validators/auth'
import type { 
  UserResponse, 
  TokenResponse, 
  ApiError,
  ApiResponse
} from '#shared/types/api'

/**
 * Auth Store
 * Manages user authentication, registration, and session state
 */
export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<UserResponse | null>(null)
  const authToken = useCookie('auth_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  })

  // Getters
  const isAuthenticated = computed(() => !!authToken.value && !!user.value)
  
  const fullName = computed(() => {
    if (!user.value) return null
    return `${user.value.first_name} ${user.value.last_name}`
  })

  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  // Actions
  const register = async (data: PersonalSignUpFormData | BusinessSignUpFormData) => {
    try {
      const { apiFetch } = useApi()
      
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
      return { success: true, data: response } as ApiResponse<UserResponse>
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return { 
        success: false, 
        error: apiError?.detail || 'Registration failed. Please try again.' 
      } as ApiResponse<UserResponse>
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const { apiFetch } = useApi()
      
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
      
      return { success: true, data: response } as ApiResponse<TokenResponse>
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return { 
        success: false, 
        error: apiError?.detail || 'Login failed. Please check your credentials.' 
      } as ApiResponse<TokenResponse>
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
      const { apiFetch } = useApi()
      
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
      const { apiFetch } = useApi()
      
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

  const updateUser = (userData: Partial<UserResponse>) => {
    if (user.value) {
      user.value = { ...user.value, ...userData }
    }
  }

  const verifyEmail = async (token: string) => {
    try {
      const { apiFetch } = useApi()
      
      const response = await apiFetch<{ message: string }>(`${AUTH_ENDPOINTS.BASE}/verify-email`, {
        method: 'POST',
        body: { token }
      })
      
      return { success: true, message: response.message }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return { 
        success: false, 
        error: apiError?.detail || 'Email verification failed.' 
      }
    }
  }

  const resendVerification = async (email: string) => {
    try {
      const { apiFetch } = useApi()
      
      const response = await apiFetch<{ message: string }>(`${AUTH_ENDPOINTS.BASE}/resend-verification`, {
        method: 'POST',
        body: { email }
      })
      
      return { success: true, message: response.message }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return { 
        success: false, 
        error: apiError?.detail || 'Failed to resend verification email.' 
      }
    }
  }

  return {
    // State
    user: readonly(user),
    authToken: readonly(authToken),
    
    // Getters
    isAuthenticated,
    fullName,
    isAdmin,
    
    // Actions
    register,
    login,
    logout,
    fetchUser,
    refreshToken,
    updateUser,
    verifyEmail,
    resendVerification
  }
})
