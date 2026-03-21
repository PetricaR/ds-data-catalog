import client from './client'
import type { CatalogStats, ColumnSearchResult, SearchResponse } from './types'

export const searchApi = {
  search: (params: {
    q: string
    entity_type?: 'dataset' | 'table'
    project_id?: string
    dataset_id?: string
    sensitivity_label?: string
    tags?: string[]
    column_name?: string
    skip?: number
    limit?: number
  }) => client.get<SearchResponse>('/search', { params }).then((r) => r.data),

  searchColumns: (name: string) =>
    client.get<ColumnSearchResult[]>('/search/columns', { params: { name } }).then((r) => r.data),

  stats: () => client.get<CatalogStats>('/stats').then((r) => r.data),

  tags: () => client.get<string[]>('/tags').then((r) => r.data),
}
