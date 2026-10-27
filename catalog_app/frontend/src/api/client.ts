import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  // Repeat array params (`tags=a&tags=b`) the way FastAPI reads lists, not axios' default `tags[]=a`
  paramsSerializer: { indexes: null },
})

// Inject JWT from localStorage if available
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('light_data_catalog_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Pages that work signed out; a 401 there must not reload them into a redirect loop
const PUBLIC_PATHS = ['/login', '/setup']

// Auto-logout on 401
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem('light_data_catalog_token')
      localStorage.removeItem('light_data_catalog_user')
      if (!PUBLIC_PATHS.includes(window.location.pathname)) window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

/** The API's error message, or `fallback` (validation errors carry a list, not a message). */
export function errorDetail(error: unknown, fallback: string): string {
  const detail = axios.isAxiosError(error) ? error.response?.data?.detail : undefined
  return typeof detail === 'string' && detail ? detail : fallback
}

export default client
