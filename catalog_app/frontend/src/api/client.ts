import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Inject JWT from localStorage if available
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('light_data_catalog_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-logout on 401
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem('light_data_catalog_token')
      localStorage.removeItem('light_data_catalog_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default client
