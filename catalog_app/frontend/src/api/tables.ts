import client from './client'
import type { ExampleQuery, PreviewEstimate, PreviewResult, QualityCheckResult, Table, TableCreate, TableUpdate } from './types'

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

  validate: (id: string, payload: { validated_by: string; validated_columns: string[] }) =>
    client.patch<Table>(`/tables/${id}/validate`, payload).then((r) => r.data),

  patchColumns: (tableId: string, cols: { id: string; description?: string; is_primary_key?: boolean }[]) =>
    client.patch<Table>(`/tables/${tableId}/columns`, cols).then((r) => r.data),

  previewEstimate: (id: string) =>
    client.get<PreviewEstimate>(`/tables/${id}/preview`).then((r) => r.data),

  previewRun: (id: string) =>
    client.post<PreviewResult>(`/tables/${id}/preview/run`).then((r) => r.data),

  patchQueries: (id: string, queries: ExampleQuery[]) =>
    client.patch<Table>(`/tables/${id}/queries`, queries).then((r) => r.data),

  qualityCheck: (id: string) =>
    client.post<QualityCheckResult>(`/tables/${id}/quality-check`).then((r) => r.data),

  remove: (id: string) => client.delete(`/tables/${id}`),
}
