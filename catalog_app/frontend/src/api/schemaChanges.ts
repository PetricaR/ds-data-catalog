import client from './client'

export interface SchemaChange {
  id: string
  table_id: string
  change_type: 'column_added' | 'column_removed'
  column_name: string
  detected_at: string
  is_acknowledged: boolean
  table_table_id: string
  table_display_name: string | null
  dataset_uuid: string
  dataset_id_str: string
  project_id: string
}

export const schemaChangesApi = {
  list: (params?: { acknowledged?: boolean; table_id?: string }) =>
    client.get<SchemaChange[]>('/schema-changes', { params }).then((r) => r.data),

  acknowledge: (id: string) =>
    client.patch<SchemaChange>(`/schema-changes/${id}/acknowledge`).then((r) => r.data),

  acknowledgeAll: (table_id?: string) =>
    client.post<{ acknowledged: number }>('/schema-changes/acknowledge-all', {}, {
      params: table_id ? { table_id } : undefined,
    }).then((r) => r.data),
}
