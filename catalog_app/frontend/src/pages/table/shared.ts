import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tablesApi } from '../../api/tables'
import type { ExampleQuery, Table } from '../../api/types'

/**
 * After a table changes: refresh the table itself (exactly — not the preview estimate under the same
 * prefix, which would re-run a BigQuery dry run) and every list or count that shows it.
 */
export function useTableRefresh(table: Pick<Table, 'id' | 'dataset_id'>) {
  const qc = useQueryClient()
  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ['dataset', table.dataset_id, 'tables'] })
    qc.invalidateQueries({ queryKey: ['tables'] })
    qc.invalidateQueries({ queryKey: ['search'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }
  return {
    // For endpoints that return the updated table
    replace: (updated: Table) => {
      qc.setQueryData(['table', table.id], updated)
      refreshLists()
    },
    // For endpoints that return something else
    refetch: () => {
      qc.invalidateQueries({ queryKey: ['table', table.id], exact: true })
      refreshLists()
    },
  }
}

/** Example queries are saved as a whole list; the cached table is the only copy, so a failed save leaves nothing stale. */
export function useSaveQueries(table: Table) {
  const { replace } = useTableRefresh(table)
  return useMutation({
    mutationFn: (queries: ExampleQuery[]) => tablesApi.patchQueries(table.id, queries),
    onSuccess: replace,
  })
}
