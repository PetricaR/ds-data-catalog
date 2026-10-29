import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import { datasetsApi } from '../api/datasets'
import { tablesApi } from '../api/tables'
import type { Dataset, Table } from '../api/types'
import {
  ColumnsEditor, ConfirmDialog, DetailsFields, FormDialog, detailsChanges, detailsOf, detailsPayload, emptyDetails,
  type ColumnDraft, type DetailsDraft,
} from './CatalogForms'
import { MONO, plural } from './ui'

// Every list and count a new, changed or removed dataset or table appears in
function useInvalidateCatalog() {
  const qc = useQueryClient()
  return () => ['datasets', 'dataset', 'tables', 'table', 'stats', 'tags', 'search', 'schema-changes']
    .forEach((key) => qc.invalidateQueries({ queryKey: [key] }))
}

/** Register a dataset that sync doesn't reach, e.g. in a project the catalog can't read. */
// Mount these only while open, so each opens empty
export function RegisterDatasetDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const invalidate = useInvalidateCatalog()
  const [ids, setIds] = useState({ project_id: '', dataset_id: '', bq_location: '' })
  const [details, setDetails] = useState<DetailsDraft>(emptyDetails)

  const create = useMutation({
    mutationFn: () => datasetsApi.create({
      project_id: ids.project_id.trim(),
      dataset_id: ids.dataset_id.trim(),
      bq_location: ids.bq_location.trim() || undefined,
      ...detailsPayload(details, 'dataset'),
    }),
    onSuccess: (ds) => {
      invalidate()
      onClose()
      navigate(`/datasets/${ds.id}`)
    },
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Register a dataset"
      submitLabel="Register dataset"
      pending={create.isPending}
      error={create.error}
      errorFallback="Could not register the dataset."
      canSubmit={!!ids.project_id.trim() && !!ids.dataset_id.trim()}
      onSubmit={() => create.mutate()}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField
          label="GCP project ID" required autoFocus placeholder="my-gcp-project"
          value={ids.project_id} onChange={(e) => setIds({ ...ids, project_id: e.target.value })}
          InputProps={{ sx: MONO }}
        />
        <TextField
          label="BigQuery dataset ID" required placeholder="sales"
          value={ids.dataset_id} onChange={(e) => setIds({ ...ids, dataset_id: e.target.value })}
          InputProps={{ sx: MONO }}
        />
      </Box>
      <TextField
        label="Location" placeholder="EU"
        helperText="Datasets in a connected GCP project are added by its sync. Register one here to document it without a sync. Registering a removed dataset restores it, with its tables."
        value={ids.bq_location} onChange={(e) => setIds({ ...ids, bq_location: e.target.value })}
      />
      <DetailsFields draft={details} onChange={setDetails} kind="dataset" />
    </FormDialog>
  )
}

export function RegisterTableDialog({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) {
  const navigate = useNavigate()
  const invalidate = useInvalidateCatalog()
  const [tableId, setTableId] = useState('')
  const [details, setDetails] = useState<DetailsDraft>(emptyDetails)
  const [columns, setColumns] = useState<ColumnDraft[]>([])

  const create = useMutation({
    mutationFn: () => tablesApi.create({
      dataset_id: dataset.id,
      table_id: tableId.trim(),
      ...detailsPayload(details, 'table'),
      columns: columns
        .filter((c) => c.name.trim())
        .map((c, position) => ({
          name: c.name.trim(),
          data_type: c.data_type || null,
          description: c.description?.trim() || null,
          is_nullable: true,
          is_primary_key: false,
          position,
        })),
    }),
    onSuccess: (t) => {
      invalidate()
      onClose()
      navigate(`/datasets/${dataset.id}/tables/${t.id}`)
    },
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Register a table in ${dataset.display_name || dataset.dataset_id}`}
      submitLabel="Register table"
      pending={create.isPending}
      error={create.error}
      errorFallback="Could not register the table."
      canSubmit={!!tableId.trim()}
      onSubmit={() => create.mutate()}
    >
      <TextField
        label="BigQuery table ID" required autoFocus placeholder="orders"
        helperText={`In ${dataset.project_id}.${dataset.dataset_id}. A table removed from the catalog comes back when registered again.`}
        value={tableId} onChange={(e) => setTableId(e.target.value)}
        InputProps={{ sx: MONO }}
      />
      <DetailsFields draft={details} onChange={setDetails} kind="table" />
      <ColumnsEditor columns={columns} onChange={setColumns} />
    </FormDialog>
  )
}

/** Edit what the catalog owns; sync keeps BigQuery's own fields (sizes, dates, schema) up to date. */
export function EditDetailsDialog<T extends Dataset | Table>({ kind, entity, onClose, onSaved }: {
  kind: 'dataset' | 'table'
  entity: T
  onClose: () => void
  onSaved: (updated: T) => void
}) {
  const qc = useQueryClient()
  const saved = detailsOf(entity)
  const [draft, setDraft] = useState<DetailsDraft>(saved)
  const changes = detailsChanges(draft, saved, kind)
  const save = useMutation({
    mutationFn: () => (kind === 'dataset'
      ? datasetsApi.update(entity.id, changes)
      : tablesApi.update(entity.id, changes)) as Promise<T>,
    onSuccess: (updated) => {
      onSaved(updated)
      if (changes.tags) qc.invalidateQueries({ queryKey: ['tags'] })
      onClose()
    },
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Edit ${kind} details`}
      submitLabel="Save"
      pending={save.isPending}
      error={save.error}
      errorFallback="Could not save the changes."
      canSubmit={Object.keys(changes).length > 0}
      onSubmit={() => save.mutate()}
    >
      <DetailsFields draft={draft} onChange={setDraft} kind={kind} />
    </FormDialog>
  )
}

/** Remove from the catalog only: nothing changes in BigQuery. */
export function RemoveDialog({ kind, entity, tableCount = 0, onClose, onRemoved }: {
  kind: 'dataset' | 'table'
  entity: Dataset | Table
  tableCount?: number
  onClose: () => void
  onRemoved: () => void
}) {
  const qc = useQueryClient()
  const invalidate = useInvalidateCatalog()
  const remove = useMutation({
    mutationFn: () => (kind === 'dataset' ? datasetsApi.remove(entity.id) : tablesApi.remove(entity.id)),
    onSuccess: () => {
      // Drop the removed entry's own queries first: refetching them would only get 404s
      qc.removeQueries({ queryKey: [kind, entity.id] })
      onRemoved()
      invalidate()
    },
  })
  const name = entity.display_name || ('table_id' in entity ? entity.table_id : entity.dataset_id)
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={`Remove this ${kind} from the catalog?`}
      confirmLabel="Remove"
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate()}
    >
      <strong>{name}</strong>
      {kind === 'dataset' && tableCount > 0 && <> and its {plural(tableCount, 'table')}</>} disappear from the catalog.
      Nothing changes in BigQuery, and syncs don't bring {kind === 'dataset' && tableCount > 0 ? 'them' : 'it'} back.
      To restore {kind === 'dataset' && tableCount > 0 ? 'them' : 'it'}, register the {kind} again: its catalog details are kept.
    </ConfirmDialog>
  )
}
