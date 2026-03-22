import client from './client'
import type { ExampleQuery, PreviewEstimate, PreviewResult, ProjectUsage, QualityCheckResult, Table, TableCreate, TableInsights, TableUpdate } from './types'

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

  togglePii: (tableId: string, columnId: string, is_pii: boolean) =>
    client.patch(`/tables/${tableId}/columns/${columnId}/pii`, { is_pii }).then((r) => r.data),

  updateLineage: (tableId: string, upstream_refs: string[], downstream_refs: string[]) =>
    client.put(`/tables/${tableId}/lineage`, { upstream_refs, downstream_refs }).then((r) => r.data),

  pullStats: (tableId: string) =>
    client.post<{ updated_columns: number; pulled_at: string }>(`/tables/${tableId}/pull-stats`).then((r) => r.data),

  updateProjects: (tableId: string, projects: ProjectUsage[]) =>
    client.put<Table>(`/tables/${tableId}/projects`, projects).then((r) => r.data),

  generateInsights: (tableId: string) =>
    client.post<TableInsights>(`/tables/${tableId}/insights`).then((r) => r.data),

  remove: (id: string) => client.delete(`/tables/${id}`),
}
