import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '../api/types'
import { authApi } from '../api/auth'

interface AuthContextType {
  user: User | null
  setUser: (user: User | null) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => authApi.getStoredUser())

  // Refresh the stored profile so role changes made by an admin show up without signing in again.
  // An invalid or expired token gets a 401, which the API client turns into a redirect to /login.
  useEffect(() => {
    if (!authApi.getStoredUser()) return
    authApi.me().then((fresh) => {
      authApi.storeUser(fresh)
      setUserState(fresh)
    }).catch(() => {})
  }, [])

  const setUser = (u: User | null) => {
    setUserState(u)
    if (!u) authApi.logout()
  }

  const logout = () => {
    authApi.logout()
    setUserState(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export const canEdit = (user: User | null) => user?.role === 'editor' || user?.role === 'admin'
export const isAdmin = (user: User | null) => user?.role === 'admin'
