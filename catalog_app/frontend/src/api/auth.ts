import client from './client'
import type { User } from './types'

export const authApi = {
  me: () => client.get<User>('/auth/me').then((r) => r.data),

  logout: () => {
    localStorage.removeItem('ds_catalog_token')
    localStorage.removeItem('ds_catalog_user')
  },

  getStoredUser: (): User | null => {
    try {
      const raw = localStorage.getItem('ds_catalog_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  storeToken: (token: string, user: User) => {
    localStorage.setItem('ds_catalog_token', token)
    localStorage.setItem('ds_catalog_user', JSON.stringify(user))
  },
}
