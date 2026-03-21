import client from './client'
import type { Table, TableCreate, TableUpdate } from './types'

export const tablesApi = {
  list: (params?: {
    dataset_id?: string
    sensitivity_label?: string
    tags?: string[]
    owner?: string
    skip?: number
    limit?: number
  }) => client.get<Table[]>('/tables', { params }).then((r) => r.data),

  get: (id: string) => client.get<Table>(`/tables/${id}`).then((r) => r.data),

  create: (data: TableCreate) =>
    client.post<Table>('/tables', data).then((r) => r.data),

  update: (id: string, data: TableUpdate) =>
    client.put<Table>(`/tables/${id}`, data).then((r) => r.data),

  remove: (id: string) => client.delete(`/tables/${id}`),
}
