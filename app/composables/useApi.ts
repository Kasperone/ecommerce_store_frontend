import type { UseFetchOptions } from 'nuxt/app'

export const useApi = () => {
  const config = useRuntimeConfig()
  const authToken = useCookie('auth_token')

  const apiFetch = $fetch.create({
    baseURL: config.public.apiBase,
    onRequest({ options }) {
      // Add auth token if available
      if (authToken.value) {
        options.headers = new Headers(options.headers || {})
        options.headers.set('Authorization', `Bearer ${authToken.value}`)
      }
    },
    onResponseError({ response }) {
      // Handle common errors
      if (response.status === 401) {
        // Clear auth token on unauthorized
        authToken.value = null
        navigateTo('/login')
      }
    }
  })

  return {
    apiFetch
  }
}

// Typed wrapper for useFetch with API base URL
export const useApiFetch = <T = any>(
  url: string,
  options?: UseFetchOptions<T>
) => {
  const config = useRuntimeConfig()
  const authToken = useCookie('auth_token')

  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
    ...(authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {})
  }

  return useFetch<T>(url, {
    ...options,
    baseURL: config.public.apiBase,
    headers
  })
}
