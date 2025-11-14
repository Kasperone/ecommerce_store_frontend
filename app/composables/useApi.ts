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
