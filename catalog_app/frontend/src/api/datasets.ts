import client from './client'
import type { Dataset, DatasetCreate, DatasetUpdate, ProjectUsage, Table } from './types'

export const datasetsApi = {
  list: (params?: {
    project_id?: string
    sensitivity_label?: string
    tags?: string[]
    owner?: string
    validated?: boolean
    skip?: number
    limit?: number
  }) => client.get<Dataset[]>('/datasets', { params }).then((r) => r.data),

  get: (id: string) => client.get<Dataset>(`/datasets/${id}`).then((r) => r.data),

  create: (data: DatasetCreate) =>
    client.post<Dataset>('/datasets', data).then((r) => r.data),

  update: (id: string, data: DatasetUpdate) =>
    client.put<Dataset>(`/datasets/${id}`, data).then((r) => r.data),

  validate: (id: string) =>
    client.patch<Dataset>(`/datasets/${id}/validate`).then((r) => r.data),

  remove: (id: string) => client.delete(`/datasets/${id}`),

  listTables: (id: string) =>
    client.get<Table[]>(`/datasets/${id}/tables`).then((r) => r.data),

  updateProjects: (id: string, projects: ProjectUsage[]) =>
    client.put<Dataset>(`/datasets/${id}/projects`, projects).then((r) => r.data),
}
