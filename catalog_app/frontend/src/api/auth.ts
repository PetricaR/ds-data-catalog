import client from './client'
import type { User } from './types'

const RETURN_TO_KEY = 'light_data_catalog_return_to'

const isInternalPath = (path: string) => path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')

export const authApi = {
  me: () => client.get<User>('/auth/me').then((r) => r.data),

  logout: () => {
    localStorage.removeItem('light_data_catalog_token')
    localStorage.removeItem('light_data_catalog_user')
  },

  getStoredUser: (): User | null => {
    try {
      const raw = localStorage.getItem('light_data_catalog_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  storeToken: (token: string, user: User) => {
    localStorage.setItem('light_data_catalog_token', token)
    localStorage.setItem('light_data_catalog_user', JSON.stringify(user))
  },

  storeUser: (user: User) => {
    localStorage.setItem('light_data_catalog_user', JSON.stringify(user))
  },

  // Where to go after the OAuth round-trip. Internal paths only, so it can't become an open redirect.
  setReturnTo: (path: string) => {
    if (!isInternalPath(path)) return
    try {
      sessionStorage.setItem(RETURN_TO_KEY, path)
    } catch {
      // storage unavailable — sign-in falls back to the default landing page
    }
  },

  takeReturnTo: (): string | null => {
    try {
      const path = sessionStorage.getItem(RETURN_TO_KEY)
      sessionStorage.removeItem(RETURN_TO_KEY)
      return path && isInternalPath(path) ? path : null
    } catch {
      return null
    }
  },
}
