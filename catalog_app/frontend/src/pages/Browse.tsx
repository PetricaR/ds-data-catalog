import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import GridOnIcon from '@mui/icons-material/GridOn'
import LanguageIcon from '@mui/icons-material/Language'
import NumbersIcon from '@mui/icons-material/Numbers'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import SdStorageOutlinedIcon from '@mui/icons-material/SdStorageOutlined'
import StorageIcon from '@mui/icons-material/Storage'
import UpdateIcon from '@mui/icons-material/Update'
import VerifiedIcon from '@mui/icons-material/Verified'
import ViewWeekOutlinedIcon from '@mui/icons-material/ViewWeekOutlined'
import { datasetsApi } from '../api/datasets'
import { schemaChangesApi } from '../api/schemaChanges'
import { searchApi } from '../api/search'
import type { Dataset } from '../api/types'
import SchemaChangesPanel from '../components/SchemaChangesPanel'
import SensitivityChip from '../components/SensitivityChip'
import { SyncProgressList, useSourceSync } from '../components/SourceSync'
import {
  EmptyState, MONO, MetaPill, PageHeader, StatTile, compactNumber, formatBytes, formatDate, plural,
} from '../components/ui'
import { canEdit, isAdmin, useAuth } from '../contexts/AuthContext'
import { tokens } from '../theme'

const INLINE_LIMIT = 15
const PAGE_SIZE = 50

function TablesList({ dataset }: { dataset: Dataset }) {
  // Same query as the dataset page, so both share one cache entry
  const { data: tables, isLoading } = useQuery({
    queryKey: ['dataset', dataset.id, 'tables'],
    queryFn: () => datasetsApi.listTables(dataset.id),
  })

  if (isLoading) {
    return (
      <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">Loading tables…</Typography>
      </Box>
    )
  }
  if (!tables?.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 1.5 }}>No tables in this dataset.</Typography>
  }

  const visible = tables.slice(0, INLINE_LIMIT)
  const overflow = tables.length - visible.length

  return (
    <>
      <List dense disablePadding aria-label={`Tables in ${dataset.dataset_id}`}>
        {visible.map((t) => (
          <ListItemButton
            key={t.id}
            component={RouterLink}
            to={`/datasets/${dataset.id}/tables/${t.id}`}
            sx={{ pl: { xs: 3, sm: 7 }, pr: 2, py: 1, gap: 1.25, alignItems: 'flex-start', borderRadius: 0, '&:hover': { bgcolor: tokens.paper } }}
          >
            {t.is_validated
              ? <VerifiedIcon titleAccess="Trusted source" sx={{ fontSize: 16, color: tokens.success, mt: '2px' }} />
              : <GridOnIcon aria-hidden sx={{ fontSize: 16, color: tokens.ink3, mt: '2px' }} />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ ...MONO, fontWeight: 500, color: tokens.ink, overflowWrap: 'anywhere' }}>{t.table_id}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                {t.row_count != null && <MetaPill icon={<NumbersIcon />}>{compactNumber(t.row_count)} rows</MetaPill>}
                {t.columns.length > 0 && <MetaPill icon={<ViewWeekOutlinedIcon />}>{t.columns.length} cols</MetaPill>}
                {t.size_bytes != null && <MetaPill icon={<SdStorageOutlinedIcon />}>{formatBytes(t.size_bytes)}</MetaPill>}
                {t.bq_last_modified && <MetaPill icon={<UpdateIcon />} title="Last modified in BigQuery">{formatDate(t.bq_last_modified)}</MetaPill>}
                <SensitivityChip label={t.sensitivity_label} />
              </Box>
            </Box>
            <ChevronRightIcon aria-hidden sx={{ fontSize: 18, color: tokens.ruleStrong, mt: '2px' }} />
          </ListItemButton>
        ))}
      </List>
      {overflow > 0 && (
        <Box sx={{ pl: { xs: 3, sm: 7 }, pr: 2, py: 1, borderTop: `1px solid ${tokens.rule}` }}>
          <Link component={RouterLink} to={`/datasets/${dataset.id}`} variant="body2">
            View all {plural(tables.length, 'table')} in {dataset.display_name || dataset.dataset_id}
          </Link>
        </Box>
      )}
    </>
  )
}

function DatasetRow({ ds }: { ds: Dataset }) {
  const [open, setOpen] = useState(false)
  const name = ds.display_name || ds.dataset_id
  const listId = `tables-${ds.id}`
  return (
    <Box sx={{ borderTop: `1px solid ${tokens.rule}`, boxShadow: ds.is_validated ? `inset 3px 0 0 ${tokens.success}` : undefined }}>
      <Box sx={{ display: 'flex', alignItems: 'center', pr: 1.5, '&:hover': { bgcolor: tokens.paper } }}>
        <ButtonBase
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={listId}
          sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1.25, pl: { xs: 2, sm: 3 }, pr: 1, py: 1.25, textAlign: 'left' }}
        >
          <ExpandMoreIcon aria-hidden sx={{ fontSize: 18, color: tokens.ink3, transition: 'transform .2s', transform: open ? 'none' : 'rotate(-90deg)' }} />
          <FolderOutlinedIcon aria-hidden sx={{ fontSize: 18, color: tokens.ink3 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" fontWeight={600} noWrap>{name}</Typography>
            {name !== ds.dataset_id && <Typography sx={{ ...MONO, fontSize: '0.75rem', color: tokens.ink3 }} noWrap>{ds.dataset_id}</Typography>}
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
            {ds.is_validated && <MetaPill tone="success" icon={<VerifiedIcon />}>Validated</MetaPill>}
            <SensitivityChip label={ds.sensitivity_label} />
            {ds.bq_location && <MetaPill icon={<LanguageIcon />} title="BigQuery location">{ds.bq_location}</MetaPill>}
            {ds.bq_last_modified && <MetaPill icon={<UpdateIcon />} title="Last modified in BigQuery">{formatDate(ds.bq_last_modified)}</MetaPill>}
          </Box>
          <MetaPill>{plural(ds.table_count ?? 0, 'table')}</MetaPill>
        </ButtonBase>
        <Tooltip title="Open dataset">
          <IconButton component={RouterLink} to={`/datasets/${ds.id}`} size="small" aria-label={`Open dataset ${name}`}>
            <OpenInNewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box id={listId} sx={{ borderTop: `1px solid ${tokens.rule}`, bgcolor: tokens.surface }}>
          <TablesList dataset={ds} />
        </Box>
      </Collapse>
    </Box>
  )
}

export default function Browse() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const sync = useSourceSync()
  const [syncOpen, setSyncOpen] = useState(false)

  const { data: datasetsPages, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['datasets'],
    queryFn: ({ pageParam }) => datasetsApi.list({ skip: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined),
    initialPageParam: 0,
  })
  const datasets = datasetsPages?.pages.flat() ?? []

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: searchApi.stats })

  const { data: schemaChanges = [] } = useQuery({
    queryKey: ['schema-changes'],
    queryFn: () => schemaChangesApi.list({ acknowledged: false }),
    refetchInterval: 60_000,
  })

  const grouped = datasets.reduce<Record<string, Dataset[]>>((acc, ds) => {
    ;(acc[ds.project_id] ??= []).push(ds)
    return acc
  }, {})
  const projects = Object.entries(grouped)

  const startSync = () => {
    setSyncOpen(true)
    sync.run()
  }

  const syncButton = admin && (
    <Button
      variant="contained"
      startIcon={sync.running ? <CircularProgress size={16} color="inherit" /> : <CloudSyncOutlinedIcon />}
      onClick={startSync}
      disabled={sync.running}
    >
      {sync.running ? 'Syncing…' : 'Sync all sources'}
    </Button>
  )

  return (
    <Box>
      <PageHeader
        eyebrow="Catalog"
        title="Browse"
        subtitle="Every BigQuery project, dataset and table synced into the catalog."
        actions={syncButton}
      />

      <SchemaChangesPanel changes={schemaChanges} canAck={canEdit(user)} />

      <Box component="section" aria-label="Catalog totals" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mb: 4 }}>
        {stats ? (
          <>
            <StatTile label="Datasets" value={compactNumber(stats.total_datasets)} />
            <StatTile label="Tables" value={compactNumber(stats.total_tables)} />
            <StatTile label="Columns" value={compactNumber(stats.total_columns)} />
            <StatTile
              label="Documented tables"
              value={`${stats.documentation_coverage}%`}
              meter={stats.documentation_coverage}
              hint={`${stats.documented_tables.toLocaleString()} of ${plural(stats.total_tables, 'table')} described`}
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={104} />)
        )}
      </Box>

      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>Projects</Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[0, 1].map((i) => <Skeleton key={i} variant="rounded" height={64} />)}
        </Box>
      )}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={<StorageIcon />}
          title="No datasets yet"
          action={admin && (
            <>
              {syncButton}
              <Button component={RouterLink} to="/sources" variant="outlined">Manage GCP sources</Button>
            </>
          )}
        >
          {admin
            ? 'Connect a GCP project under GCP sources, then sync it to discover its datasets and tables.'
            : 'An admin has to connect and sync a GCP project before anything shows up here.'}
        </EmptyState>
      )}

      {projects.map(([projectId, projectDatasets]) => {
        const totalTables = projectDatasets.reduce((s, d) => s + (d.table_count ?? 0), 0)
        const validated = projectDatasets.filter((d) => d.is_validated).length
        return (
          <Accordion key={projectId} defaultExpanded={projects.length === 1} sx={{ mb: 1.5 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: { xs: 2, sm: 2.5 }, minHeight: 60 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <AccountTreeOutlinedIcon aria-hidden sx={{ color: tokens.accent, fontSize: 20 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ ...MONO, fontSize: '0.9375rem', fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {projectId}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {plural(projectDatasets.length, 'dataset')} · {plural(totalTables, 'table')}
                    {validated > 0 && ` · ${validated} validated`}
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              {projectDatasets.map((ds) => <DatasetRow key={ds.id} ds={ds} />)}
            </AccordionDetails>
          </Accordion>
        )
      })}

      {hasNextPage && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button
            variant="outlined"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            startIcon={isFetchingNextPage ? <CircularProgress size={14} /> : undefined}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more datasets'}
          </Button>
        </Box>
      )}

      <Dialog open={syncOpen} onClose={() => setSyncOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{sync.running ? 'Syncing from BigQuery…' : 'BigQuery sync'}</DialogTitle>
        <DialogContent>
          {sync.error && <Alert severity="error">{sync.error}</Alert>}
          {sync.rows.length > 0 && <SyncProgressList rows={sync.rows} />}
          {sync.running && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
              Projects sync one at a time. You can close this window; the sync keeps running while this page is open.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSyncOpen(false)}>{sync.running ? 'Hide' : 'Close'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
