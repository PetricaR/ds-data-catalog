import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import GppBadOutlinedIcon from '@mui/icons-material/GppBadOutlined'
import LanguageIcon from '@mui/icons-material/Language'
import NumbersIcon from '@mui/icons-material/Numbers'
import SdStorageOutlinedIcon from '@mui/icons-material/SdStorageOutlined'
import VerifiedIcon from '@mui/icons-material/Verified'
import ViewWeekOutlinedIcon from '@mui/icons-material/ViewWeekOutlined'
import { datasetsApi } from '../api/datasets'
import { schemaChangesApi, type SchemaChange } from '../api/schemaChanges'
import { tablesApi } from '../api/tables'
import type { ProjectUsage, Table } from '../api/types'
import { EditDetailsDialog, RemoveDialog } from '../components/CatalogDialogs'
import ProjectsEditor from '../components/ProjectsEditor'
import SchemaChangesPanel from '../components/SchemaChangesPanel'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import ValidationWizard from '../components/ValidationWizard'
import {
  CopyButton, LoadError, MONO, MetaPill, PATH_SX, PageHeader, compactNumber, formatBytes, formatDate, plural,
} from '../components/ui'
import { canEdit, useAuth } from '../contexts/AuthContext'
import { tokens } from '../theme'
import InsightsSection from './table/InsightsSection'
import LineageSection from './table/LineageSection'
import PreviewSection from './table/PreviewSection'
import QueriesSection from './table/QueriesSection'
import { DataplexSection, NullCheckSection, PiiScanSection, SchemaHistorySection, UsageSection } from './table/ScanSections'
import SchemaSection from './table/SchemaSection'
import { useTableRefresh } from './table/shared'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="caption" sx={{ color: tokens.ink3, fontWeight: 500 }}>{label}</Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'break-word' }}>{children}</Typography>
    </Box>
  )
}

function Description({ table, editor }: { table: Table; editor: boolean }) {
  const { replace } = useTableRefresh(table)
  const [draft, setDraft] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (description: string) => tablesApi.update(table.id, { description }),
    onSuccess: (t) => { replace(t); setDraft(null) },
  })

  return (
    <Box component="section" aria-labelledby="description-heading" sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface, px: { xs: 1.5, sm: 2 }, py: 1.5, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <Typography id="description-heading" variant="h6" component="h2" sx={{ flex: 1 }}>Description</Typography>
        {editor && draft === null && (
          <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setDraft(table.description ?? '')}>
            {table.description ? 'Edit' : 'Add description'}
          </Button>
        )}
      </Box>
      {draft !== null ? (
        <Box component="form" onSubmit={(e) => { e.preventDefault(); save.mutate(draft.trim()) }}>
          <TextField
            fullWidth multiline minRows={3} autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What is in this table, where it comes from, and what it should (and shouldn't) be used for."
            inputProps={{ 'aria-label': 'Table description' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDraft(null)
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save.mutate(draft.trim())
            }}
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>⌘/Ctrl + Enter to save · Esc to cancel</Typography>
            <Button size="small" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="small" type="submit" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </Box>
        </Box>
      ) : (
        <Typography variant="body1" sx={{ color: table.description ? tokens.ink2 : tokens.ink3, whiteSpace: 'pre-wrap', fontStyle: table.description ? 'normal' : 'italic' }}>
          {table.description || 'No description yet.'}
        </Typography>
      )}
    </Box>
  )
}

export default function TableDetail() {
  const { datasetId, tableId } = useParams<{ datasetId: string; tableId: string }>()
  const { user } = useAuth()
  const editor = canEdit(user)

  const { data: table, isLoading, error } = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => tablesApi.get(tableId!),
    enabled: !!tableId,
    retry: false,
  })
  const { data: dataset } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => datasetsApi.get(datasetId!),
    enabled: !!datasetId && !!table,
    retry: false,
  })
  const { data: tableChanges = [] } = useQuery({
    queryKey: ['schema-changes', tableId],
    queryFn: () => schemaChangesApi.list({ acknowledged: false, table_id: tableId }),
    enabled: !!table,
  })

  if (isLoading) {
    return (
      <Box>
        <Skeleton width={300} height={20} sx={{ mb: 2 }} />
        <Skeleton width={420} height={44} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={420} />
      </Box>
    )
  }
  if (!table) return <LoadError error={error} what="table" />

  return (
    <TableView
      table={table}
      datasetName={dataset?.display_name || table.dataset_display_name || 'Dataset'}
      location={dataset?.bq_location ?? null}
      editor={editor}
      tableChanges={tableChanges}
    />
  )
}

// Split from TableDetail so its hooks can rely on a loaded table
function TableView({ table, datasetName, location, editor, tableChanges }: {
  table: Table
  datasetName: string
  location: string | null
  editor: boolean
  tableChanges: SchemaChange[]
}) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [dialog, setDialog] = useState<'edit' | 'remove' | null>(null)
  const navigate = useNavigate()
  const { replace } = useTableRefresh(table)
  const validate = useMutation({
    mutationFn: (validated_columns: string[] | null) =>
      tablesApi.validate(table.id, validated_columns ? { trusted: true, validated_columns } : { trusted: false }),
    onSuccess: (t) => { replace(t); setWizardOpen(false); setConfirmRevoke(false) },
  })
  const projects = useMutation({
    mutationFn: (p: ProjectUsage[]) => tablesApi.updateProjects(table.id, p),
    onSuccess: replace,
  })

  const name = table.display_name || table.table_id
  const path = `${table.dataset_project_id}.${table.dataset_bq_dataset_id}.${table.table_id}`
  const score = table.quality_score

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/browse" color="inherit">Browse</Link>
        <Typography component="span" sx={{ ...MONO, fontSize: 'inherit', color: tokens.ink3 }}>{table.dataset_project_id}</Typography>
        <Link component={RouterLink} to={`/datasets/${table.dataset_id}`} color="inherit">{datasetName}</Link>
        <Typography component="span" color="text.primary" fontSize="inherit" aria-current="page">{name}</Typography>
      </Breadcrumbs>

      <PageHeader
        eyebrow="Table"
        title={name}
        subtitle={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="span" sx={PATH_SX}>{path}</Box>
            <CopyButton text={path} label="Copy table path" />
          </Box>
        }
        actions={editor && (
          <>
            <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setDialog('edit')}>Edit details</Button>
            {table.is_validated ? (
              <Button variant="outlined" color="inherit" startIcon={<GppBadOutlinedIcon />} onClick={() => setConfirmRevoke(true)} sx={{ borderColor: tokens.ruleStrong }}>
                Revoke trust
              </Button>
            ) : (
              <Button variant="contained" startIcon={<VerifiedIcon />} onClick={() => setWizardOpen(true)}>
                Mark as trusted
              </Button>
            )}
            <Tooltip title="Remove from the catalog">
              <IconButton aria-label="Remove table from the catalog" onClick={() => setDialog('remove')} sx={{ '&:hover': { color: tokens.danger } }}>
                <DeleteOutlineIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      >
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1.5 }}>
          {table.is_validated && <MetaPill tone="success" icon={<VerifiedIcon />}>Trusted source</MetaPill>}
          <SensitivityChip label={table.sensitivity_label} showInternal />
          {table.row_count != null && <MetaPill icon={<NumbersIcon />}>{compactNumber(table.row_count)} rows</MetaPill>}
          {table.size_bytes != null && <MetaPill icon={<SdStorageOutlinedIcon />}>{formatBytes(table.size_bytes)}</MetaPill>}
          <MetaPill icon={<ViewWeekOutlinedIcon />}>{plural(table.columns.length, 'col')}</MetaPill>
          {location && <MetaPill icon={<LanguageIcon />} title="BigQuery location">{location}</MetaPill>}
          {table.tags.map((t) => <TagChip key={t} tag={t} />)}
        </Box>

        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2, m: 0, mt: 2.5, pt: 2, borderTop: `1px solid ${tokens.rule}` }}>
          <Fact label="Owner">{table.owner || '—'}</Fact>
          <Fact label="Validated by">
            {table.is_validated ? (
              <>
                {table.validated_by ?? '—'}
                {table.validated_at && <Box component="span" sx={{ display: 'block', color: tokens.ink3 }}>{formatDate(table.validated_at)}</Box>}
              </>
            ) : 'Not validated'}
          </Fact>
          <Fact label="Created in BigQuery">{formatDate(table.bq_created_at)}</Fact>
          <Fact label="Modified in BigQuery">{formatDate(table.bq_last_modified)}</Fact>
          <Fact label="Catalog entry updated">{formatDate(table.updated_at)}</Fact>
          {score != null && (
            <Box sx={{ minWidth: 0 }} title="Description, column docs, validation, tags and example queries">
              <Typography component="dt" variant="caption" sx={{ color: tokens.ink3, fontWeight: 500 }}>Documentation score</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0 }}>
                {Math.round(score)}%
                <LinearProgress variant="determinate" value={score} aria-label="Documentation score" sx={{ mt: 0.75, maxWidth: 160 }} />
              </Typography>
            </Box>
          )}
        </Box>
      </PageHeader>

      <SchemaChangesPanel changes={tableChanges} canAck={editor} tableId={table.id} />

      <Description table={table} editor={editor} />
      <SchemaSection table={table} editor={editor} />
      {editor && <PreviewSection table={table} />}
      <QueriesSection table={table} editor={editor} />
      <InsightsSection table={table} editor={editor} />
      <LineageSection table={table} editor={editor} />
      <ProjectsEditor
        projects={table.used_in_projects ?? []}
        what="table"
        canEdit={editor}
        saving={projects.isPending}
        onSave={projects.mutateAsync}
      />
      {editor && (
        <>
          <UsageSection table={table} />
          <PiiScanSection table={table} />
          <NullCheckSection table={table} />
          <DataplexSection table={table} />
        </>
      )}
      <SchemaHistorySection table={table} />

      {dialog === 'edit' && <EditDetailsDialog kind="table" entity={table} onClose={() => setDialog(null)} onSaved={replace} />}
      {dialog === 'remove' && (
        <RemoveDialog
          kind="table"
          entity={table}
          onClose={() => setDialog(null)}
          onRemoved={() => navigate(`/datasets/${table.dataset_id}`, { replace: true })}
        />
      )}

      {editor && (
        <>
          <ValidationWizard
            open={wizardOpen}
            onClose={() => setWizardOpen(false)}
            table={table}
            onValidate={(cols) => validate.mutate(cols)}
            isValidating={validate.isPending}
          />
          <Dialog open={confirmRevoke} onClose={() => setConfirmRevoke(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Revoke trusted status?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                <strong>{name}</strong> stays in the catalog but leaves Trusted data, and its validated columns are cleared.
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setConfirmRevoke(false)}>Cancel</Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => validate.mutate(null)}
                disabled={validate.isPending}
                startIcon={validate.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
              >
                Revoke
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  )
}
