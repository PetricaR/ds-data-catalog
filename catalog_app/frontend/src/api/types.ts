export type SensitivityLabel = 'public' | 'internal' | 'confidential' | 'restricted'

export interface Dataset {
  id: string
  project_id: string
  dataset_id: string
  display_name: string | null
  description: string | null
  owner: string | null
  data_steward: string | null
  tags: string[]
  sensitivity_label: SensitivityLabel
  bq_location: string | null
  bq_created_at: string | null
  bq_last_modified: string | null
  is_active: boolean
  is_validated: boolean
  validated_by: string | null
  validated_at: string | null
  created_at: string
  updated_at: string
  table_count: number
}

export interface DatasetCreate {
  project_id: string
  dataset_id: string
  display_name?: string
  description?: string
  owner?: string
  data_steward?: string
  tags?: string[]
  sensitivity_label?: SensitivityLabel
  bq_location?: string
}

export interface DatasetUpdate {
  display_name?: string
  description?: string
  owner?: string
  data_steward?: string
  tags?: string[]
  sensitivity_label?: SensitivityLabel
}

export interface Column {
  id: string
  name: string
  data_type: string | null
  description: string | null
  is_nullable: boolean
  is_primary_key: boolean
  position: number
}

export interface ExampleQuery {
  title: string
  sql: string
}

export interface TablePreview {
  columns: string[]
  rows: Record<string, string | null>[]
}

export interface Table {
  id: string
  dataset_id: string
  table_id: string
  display_name: string | null
  description: string | null
  owner: string | null
  tags: string[]
  sensitivity_label: SensitivityLabel
  row_count: number | null
  size_bytes: number | null
  is_active: boolean
  is_validated: boolean
  validated_by: string | null
  validated_at: string | null
  example_queries: ExampleQuery[]
  created_at: string
  updated_at: string
  columns: Column[]
  dataset_project_id: string | null
  dataset_display_name: string | null
}

export interface TableCreate {
  dataset_id: string
  table_id: string
  display_name?: string
  description?: string
  owner?: string
  tags?: string[]
  sensitivity_label?: SensitivityLabel
  columns?: Omit<Column, 'id'>[]
}

export interface TableUpdate {
  display_name?: string
  description?: string
  owner?: string
  tags?: string[]
  sensitivity_label?: SensitivityLabel
}

export interface SearchResult {
  entity_type: 'dataset' | 'table'
  id: string
  name: string
  description: string | null
  project_id: string
  dataset_id: string
  table_id: string | null
  tags: string[]
  sensitivity_label: SensitivityLabel
  updated_at: string
}

export interface SearchResponse {
  query: string
  total: number
  results: SearchResult[]
}

export interface CatalogStats {
  total_datasets: number
  total_tables: number
  total_columns: number
  documented_tables: number
  documentation_coverage: number
}
