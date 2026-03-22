import client from './client'
import type { GCPSource } from './types'

export interface SyncRequest {
  project_id?: string
  secret_name?: string
  secret_version?: string
  dataset_filter?: string
}

export interface SyncResult {
  datasets_added: number
  datasets_updated: number
  tables_added: number
  tables_updated: number
  columns_synced: number
  errors: string[]
}

export interface SyncResponse {
  project_id: string
  result: SyncResult
}

export interface SourceCreate {
  project_id: string
  display_name?: string
  secret_name?: string
}

export interface SourceUpdate {
  display_name?: string
  secret_name?: string
  is_active?: boolean
}

export const bqApi = {
  // Single ad-hoc sync
  sync: (req: SyncRequest = {}) =>
    client.post<SyncResponse>('/bq/sync', req).then((r) => r.data),

  // Sources CRUD
  listSources: () =>
    client.get<GCPSource[]>('/bq/sources').then((r) => r.data),

  addSource: (body: SourceCreate) =>
    client.post<GCPSource>('/bq/sources', body).then((r) => r.data),

  updateSource: (id: string, body: SourceUpdate) =>
    client.patch<GCPSource>(`/bq/sources/${id}`, body).then((r) => r.data),

  deleteSource: (id: string) =>
    client.delete(`/bq/sources/${id}`),

  // Sync all active sources
  syncAll: () =>
    client.post<SyncResponse[]>('/bq/sync/all').then((r) => r.data),

  // Sync one source by ID
  syncSource: (id: string) =>
    client.post<SyncResponse>(`/bq/sync/source/${id}`).then((r) => r.data),
}
