import client from './client'
import type { CatalogStats, SearchResponse } from './types'

export const searchApi = {
  search: (params: {
    q: string
    entity_type?: 'dataset' | 'table'
    project_id?: string
    dataset_id?: string
    sensitivity_label?: string
    tags?: string[]
    skip?: number
    limit?: number
  }) => client.get<SearchResponse>('/search', { params }).then((r) => r.data),

  stats: () => client.get<CatalogStats>('/stats').then((r) => r.data),

  tags: () => client.get<string[]>('/tags').then((r) => r.data),
}
