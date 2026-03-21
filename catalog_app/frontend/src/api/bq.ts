import client from './client'

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
  secret_name: string
  result: SyncResult
}

export const bqApi = {
  sync: (req: SyncRequest = {}) =>
    client.post<SyncResponse>('/bq/sync', req).then((r) => r.data),
}
