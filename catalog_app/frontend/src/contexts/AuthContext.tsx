import { createContext, useContext, useState, type ReactNode } from 'react'
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
