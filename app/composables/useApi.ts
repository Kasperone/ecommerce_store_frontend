import type { UseFetchOptions } from 'nuxt/app'

export const useApi = () => {
  const config = useRuntimeConfig()
  const authToken = useCookie('auth_token')

  const apiFetch = $fetch.create({
    baseURL: config.public.apiBase,
    onRequest({ options }) {
      // Add auth token if available
      if (authToken.value) {
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${authToken.value}`
        }
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
export const useApiFetch = <T>(
  url: string,
  options?: UseFetchOptions<T>
) => {
  const config = useRuntimeConfig()
  const authToken = useCookie('auth_token')

  return useFetch<T>(url, {
    baseURL: config.public.apiBase,
    ...options,
    headers: {
      ...options?.headers,
      ...(authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {})
    }
  })
}
