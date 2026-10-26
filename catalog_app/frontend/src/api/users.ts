import client from './client'
import type { ManagedUser, UserRole } from './types'

export const usersApi = {
  list: () => client.get<ManagedUser[]>('/users').then((r) => r.data),

  update: (id: string, payload: { role?: UserRole; is_active?: boolean }) =>
    client.patch<ManagedUser>(`/users/${id}`, payload).then((r) => r.data),
}
