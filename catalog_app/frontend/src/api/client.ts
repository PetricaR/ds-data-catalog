import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Inject JWT from localStorage if available
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ds_catalog_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default client
