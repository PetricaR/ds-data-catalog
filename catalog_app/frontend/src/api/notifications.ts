import client from './client'
import type { MetadataNotification } from './types'

export const notificationsApi = {
  list: (limit = 20) =>
    client.get<MetadataNotification[]>('/notifications', { params: { limit } }).then((r) => r.data),

  dismiss: (id: string) =>
    client.post(`/notifications/${id}/dismiss`).then((r) => r.data),

  dismissAll: () =>
    client.post('/notifications/dismiss-all').then((r) => r.data),
}
