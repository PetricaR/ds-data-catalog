import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Collapse from '@mui/material/Collapse'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import List from '@mui/material/List'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListItemButton from '@mui/material/ListItemButton'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import CloudSyncIcon from '@mui/icons-material/CloudSync'       // Sync from BigQuery
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import AccountTreeIcon from '@mui/icons-material/AccountTree'      // GCP Project
import FolderOpenIcon from '@mui/icons-material/FolderOpen'        // BQ Dataset
import GridOnIcon from '@mui/icons-material/GridOn'                // table row item
import ViewWeekIcon from '@mui/icons-material/ViewWeek'            // columns
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser'    // validated
import VerifiedIcon from '@mui/icons-material/Verified'            // stat: documented
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import SdStorageIcon from '@mui/icons-material/SdStorage'          // storage size
import UpdateIcon from '@mui/icons-material/Update'                // last modified
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'  // created date
import LanguageIcon from '@mui/icons-material/Language'            // BQ region / location
import NumbersIcon from '@mui/icons-material/Numbers'              // row count
import { datasetsApi } from '../api/datasets'
import { tablesApi } from '../api/tables'
import { bqApi } from '../api/bq'
import { schemaChangesApi } from '../api/schemaChanges'
import { searchApi } from '../api/search'
import type { SyncResponse } from '../api/bq'
import type { Dataset } from '../api/types'

const INLINE_LIMIT = 15

function fmtBytes(bytes: number | null): string | null {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function TablesList({ datasetId, datasetDbId, bqLocation, onNavigate, onOpenDataset }: { datasetId: string; datasetDbId: string; bqLocation?: string | null; onNavigate: (tableId: string) => void; onOpenDataset: () => void }) {
  const { data: tables, isLoading } = useQuery({
    queryKey: ['dataset', datasetDbId, 'tables'],
    queryFn: () => tablesApi.list({ dataset_id: datasetDbId }),
  })

  if (isLoading) {
    return (
      <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={12} />
        <Typography variant="caption" color="text.secondary">Loading tables…</Typography>
      </Box>
    )
  }

  if (!tables?.length) {
    return (
      <Box sx={{ px: 3, py: 1.5 }}>
        <Typography variant="caption" color="text.secondary">No tables found.</Typography>
      </Box>
    )
  }

  const visible = tables.slice(0, INLINE_LIMIT)
  const overflow = tables.length - INLINE_LIMIT

  return (
    <>
      <List dense disablePadding>
        {visible.map((t) => (
          <ListItemButton
            key={t.id}
            onClick={() => onNavigate(t.id)}
            sx={{ pl: 9, pr: 2, py: 1, alignItems: 'flex-start', '&:hover': { bgcolor: '#f8faff' } }}
          >
            <ListItemIcon sx={{ minWidth: 28, mt: '3px' }}>
              {t.is_validated
                ? <VerifiedUserIcon sx={{ fontSize: 15, color: '#137333' }} />
                : <GridOnIcon sx={{ fontSize: 15, color: '#9aa0a6' }} />
              }
            </ListItemIcon>

            {/* Table name (row 1) + meta pills (row 2) */}
            <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
              {/* Row 1: table name */}
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600, color: '#202124' }}>
                {t.table_id}
              </Typography>
              {/* Row 2: pills — only rendered when at least one exists */}
              {(t.row_count != null || (t.columns?.length ?? 0) > 0 || fmtBytes(t.size_bytes) || bqLocation || t.bq_created_at || t.bq_last_modified) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {t.row_count != null && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.9, py: 0.25, borderRadius: '6px', bgcolor: '#f1f3f4' }}>
                      <NumbersIcon sx={{ fontSize: 11, color: '#5f6368' }} />
                      <Typography sx={{ fontSize: '0.68rem', color: '#3c4043', fontWeight: 500, lineHeight: 1 }}>
                        {t.row_count.toLocaleString()} rows
                      </Typography>
                    </Box>
                  )}
                  {(t.columns?.length ?? 0) > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.9, py: 0.25, borderRadius: '6px', bgcolor: '#f1f3f4' }}>
                      <ViewWeekIcon sx={{ fontSize: 11, color: '#5f6368' }} />
                      <Typography sx={{ fontSize: '0.68rem', color: '#3c4043', fontWeight: 500, lineHeight: 1 }}>
                        {t.columns.length} cols
                      </Typography>
                    </Box>
                  )}
                  {fmtBytes(t.size_bytes) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.9, py: 0.25, borderRadius: '6px', bgcolor: '#f1f3f4' }}>
                      <SdStorageIcon sx={{ fontSize: 11, color: '#5f6368' }} />
                      <Typography sx={{ fontSize: '0.68rem', color: '#3c4043', fontWeight: 500, lineHeight: 1 }}>
                        {fmtBytes(t.size_bytes)}
                      </Typography>
                    </Box>
                  )}
                  {bqLocation && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.9, py: 0.25, borderRadius: '6px', bgcolor: '#e8f0fe' }}>
                      <LanguageIcon sx={{ fontSize: 11, color: '#1a73e8' }} />
                      <Typography sx={{ fontSize: '0.68rem', color: '#1a73e8', fontWeight: 500, lineHeight: 1 }}>
                        {bqLocation}
                      </Typography>
                    </Box>
                  )}
                  {t.bq_created_at && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.9, py: 0.25, borderRadius: '6px', bgcolor: '#fce8e6' }}>
                      <CalendarTodayIcon sx={{ fontSize: 11, color: '#c5221f' }} />
                      <Typography sx={{ fontSize: '0.68rem', color: '#c5221f', fontWeight: 500, lineHeight: 1 }}>
                        {new Date(t.bq_created_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                  {t.bq_last_modified && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.9, py: 0.25, borderRadius: '6px', bgcolor: '#e6f4ea' }}>
                      <UpdateIcon sx={{ fontSize: 11, color: '#137333' }} />
                      <Typography sx={{ fontSize: '0.68rem', color: '#137333', fontWeight: 500, lineHeight: 1 }}>
                        {new Date(t.bq_last_modified).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            <ChevronRightIcon sx={{ fontSize: 14, color: '#dadce0', flexShrink: 0, mt: '3px' }} />
          </ListItemButton>
        ))}
      </List>
      {overflow > 0 && (
        <Box
          sx={{
            pl: 7, pr: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1,
            borderTop: '1px solid', borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            +{overflow} more table{overflow !== 1 ? 's' : ''}
          </Typography>
          <Button
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: '13px !important' }} />}
            onClick={onOpenDataset}
            sx={{ fontSize: '0.75rem', ml: 0.5 }}
          >
            View all in dataset page
          </Button>
        </Box>
      )}
    </>
  )
}


export default function Browse() {
  const navigate = useNavigate()
  const [syncDialog, setSyncDialog] = useState(false)
  const [expandedValidated, setExpandedValidated] = useState<Set<string>>(new Set())
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const qc = useQueryClient()

  const toggleValidated = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedValidated((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const syncMutation = useMutation({
    mutationFn: () => bqApi.sync(),
    onSuccess: (data) => {
      setSyncResult(data)
      setSyncDialog(true)
      qc.invalidateQueries({ queryKey: ['datasets'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['schema-changes'] })
    },
    onError: (err: any) => {
      setSyncError(err.response?.data?.detail ?? 'Sync failed.')
      setSyncDialog(true)
    },
  })

  const PAGE_SIZE = 50
  const {
    data: datasetsPages,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['datasets'],
    queryFn: ({ pageParam = 0 }) => datasetsApi.list({ skip: pageParam as number, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    initialPageParam: 0,
  })
  const datasets = datasetsPages?.pages.flat()

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: searchApi.stats,
  })

  const { data: schemaChanges = [] } = useQuery({
    queryKey: ['schema-changes'],
    queryFn: () => schemaChangesApi.list({ acknowledged: false }),
    refetchInterval: 60_000,
  })

  const ackMutation = useMutation({
    mutationFn: (id: string) => schemaChangesApi.acknowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schema-changes'] }),
  })

  const ackAllMutation = useMutation({
    mutationFn: () => schemaChangesApi.acknowledgeAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schema-changes'] }),
  })

  const grouped = (datasets ?? []).reduce<Record<string, Dataset[]>>((acc, ds) => {
    if (!acc[ds.project_id]) acc[ds.project_id] = []
    acc[ds.project_id].push(ds)
    return acc
  }, {})

  return (
    <Box>
      {/* Schema change alerts */}
      <Collapse in={schemaChanges.length > 0}>
        <Box sx={{ mb: 3, border: '1px solid #f9a825', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, bgcolor: '#fffde7', borderBottom: '1px solid #f9a825' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, color: '#e65100' }}>
              Schema Changes Detected
              <Chip label={schemaChanges.length} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: '#e65100', color: 'white' }} />
            </Typography>
            <Typography variant="caption" color="text.secondary">Detected on last sync</Typography>
            <Button
              size="small"
              startIcon={<DoneAllIcon sx={{ fontSize: '14px !important' }} />}
              onClick={() => ackAllMutation.mutate()}
              disabled={ackAllMutation.isPending}
              sx={{ fontSize: '0.72rem', textTransform: 'none', color: '#e65100' }}
            >
              Acknowledge all
            </Button>
          </Box>
          {schemaChanges.slice(0, 8).map((c) => (
            <Box
              key={c.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 0.9,
                borderBottom: '1px solid', borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
                '&:hover': { bgcolor: '#fafafa' },
              }}
            >
              {c.change_type === 'column_added'
                ? <AddCircleOutlineIcon sx={{ fontSize: 15, color: '#2e7d32', flexShrink: 0 }} />
                : <RemoveCircleOutlineIcon sx={{ fontSize: 15, color: '#c62828', flexShrink: 0 }} />}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    variant="body2" fontWeight={500}
                    sx={{ fontFamily: 'monospace', cursor: 'pointer', '&:hover': { color: '#1a73e8' } }}
                    onClick={() => navigate(`/datasets/${c.dataset_uuid}/tables/${c.table_id}`)}
                  >
                    {c.project_id}.{c.dataset_id_str}.{c.table_table_id}
                  </Typography>
                  <Chip
                    label={c.change_type === 'column_added' ? 'added' : 'removed'}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', bgcolor: c.change_type === 'column_added' ? '#e8f5e9' : '#ffebee', color: c.change_type === 'column_added' ? '#2e7d32' : '#c62828' }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Column <strong style={{ fontFamily: 'monospace' }}>{c.column_name}</strong>
                  {' · '}{new Date(c.detected_at).toLocaleString()}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => ackMutation.mutate(c.id)} disabled={ackMutation.isPending} sx={{ color: 'text.disabled', '&:hover': { color: 'success.main' } }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          ))}
          {schemaChanges.length > 8 && (
            <Box sx={{ px: 2.5, py: 0.75, bgcolor: '#fffde7' }}>
              <Typography variant="caption" color="text.secondary">+ {schemaChanges.length - 8} more</Typography>
            </Box>
          )}
        </Box>
      </Collapse>

      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Browse Catalog</Typography>
        <Button
          variant="contained"
          startIcon={syncMutation.isPending ? <CircularProgress size={15} color="inherit" /> : <CloudSyncIcon />}
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          sx={{ borderRadius: 2, px: 2.5, py: 1, fontWeight: 600, textTransform: 'none', boxShadow: 'none', '&:hover': { boxShadow: 1 } }}
        >
          {syncMutation.isPending ? 'Syncing…' : 'Sync from BigQuery'}
        </Button>
      </Box>

      {/* Stats */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { icon: <FolderOpenIcon />, value: stats.total_datasets, label: 'Datasets', color: '#1a73e8' },
            { icon: <GridOnIcon />, value: stats.total_tables, label: 'Tables', color: '#137333' },
            { icon: <ViewWeekIcon />, value: stats.total_columns, label: 'Columns', color: '#e37400' },
            { icon: <VerifiedIcon />, value: `${stats.documentation_coverage}%`, label: 'Documented', color: '#9334e6' },
          ].map(({ icon, value, label, color }) => (
            <Grid item xs={6} sm={3} key={label}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ p: 1, borderRadius: 2, backgroundColor: `${color}18`, color }}>{icon}</Box>
                  <Box>
                    <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>{value}</Typography>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[0, 1].map((i) => <Skeleton key={i} variant="rounded" height={64} />)}
        </Box>
      )}

      {/* Projects → Datasets */}
      {!isLoading && Object.entries(grouped).map(([projectId, projectDatasets]) => {
        const totalTables = projectDatasets.reduce((s, d) => s + (d.table_count ?? 0), 0)
        const validatedDatasets = projectDatasets.filter((d) => d.is_validated).length

        return (
          <Accordion
            key={projectId}
            disableGutters
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider', mb: 2, borderRadius: '10px !important', '&:before': { display: 'none' } }}
          >
            {/* Project header */}
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ px: 2.5, py: 1, bgcolor: '#f8f9fa', borderRadius: '10px', minHeight: 52 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, mr: 1 }}>
                <AccountTreeIcon sx={{ color: '#1a73e8', fontSize: 20 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                    {projectId}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary">
                      {projectDatasets.length} dataset{projectDatasets.length !== 1 ? 's' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {totalTables} table{totalTables !== 1 ? 's' : ''}
                    </Typography>
                    {validatedDatasets > 0 && (
                      <Typography variant="caption" sx={{ color: '#2e7d32', fontWeight: 500 }}>
                        {validatedDatasets} validated
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={{ p: 0 }}>
              {projectDatasets.map((ds, idx) => (
                <Box key={ds.id}>
                  {idx > 0 && <Divider />}

                  {/* Dataset row */}
                  <Box
                    sx={{
                      pl: 5.5, pr: 2, py: 1.25,
                      display: 'flex', alignItems: 'center', gap: 1,
                      borderLeft: ds.is_validated ? '3px solid #137333' : '3px solid transparent',
                      '&:hover': { bgcolor: '#f8faff' },
                      transition: 'background 0.12s',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => toggleValidated(ds.id, e)}
                  >
                    <FolderOpenIcon sx={{ color: '#9aa0a6', fontSize: 15, flexShrink: 0 }} />
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
                      {ds.display_name || ds.dataset_id}
                    </Typography>
                    <Chip
                      label={`${ds.table_count ?? 0} tables`}
                      size="small"
                      sx={{ fontSize: '0.7rem', height: 18, bgcolor: '#f1f3f4', color: '#5f6368', flexShrink: 0 }}
                    />
                    {ds.bq_location && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.8, py: 0.2, borderRadius: '6px', bgcolor: '#e8f0fe', flexShrink: 0 }}>
                        <LanguageIcon sx={{ fontSize: 11, color: '#1a73e8' }} />
                        <Typography sx={{ fontSize: '0.68rem', color: '#1a73e8', fontWeight: 500, lineHeight: 1 }}>{ds.bq_location}</Typography>
                      </Box>
                    )}
                    {ds.bq_last_modified && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 0.8, py: 0.2, borderRadius: '6px', bgcolor: '#e6f4ea', flexShrink: 0 }}>
                        <UpdateIcon sx={{ fontSize: 11, color: '#137333' }} />
                        <Typography sx={{ fontSize: '0.68rem', color: '#137333', fontWeight: 500, lineHeight: 1 }}>
                          {new Date(ds.bq_last_modified).toLocaleDateString()}
                        </Typography>
                      </Box>
                    )}
                    {ds.is_validated && (
                      <VerifiedIcon sx={{ fontSize: 14, color: '#137333', flexShrink: 0 }} />
                    )}
                    <Tooltip title="Open dataset">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); navigate(`/datasets/${ds.id}`) }}
                        sx={{ color: 'text.disabled', '&:hover': { color: '#1a73e8' }, flexShrink: 0 }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                    <ExpandMoreIcon sx={{
                      fontSize: 16, color: '#9aa0a6', flexShrink: 0,
                      transition: 'transform 0.2s',
                      transform: expandedValidated.has(ds.id) ? 'rotate(180deg)' : 'none',
                    }} />
                  </Box>

                  {/* Tables list */}
                  <Collapse in={expandedValidated.has(ds.id)} unmountOnExit>
                    <Divider />
                    <TablesList
                      datasetId={ds.dataset_id}
                      datasetDbId={ds.id}
                      bqLocation={ds.bq_location}
                      onNavigate={(tableId) => navigate(`/datasets/${ds.id}/tables/${tableId}`)}
                      onOpenDataset={() => navigate(`/datasets/${ds.id}`)}
                    />
                  </Collapse>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )
      })}

      {!isLoading && Object.keys(grouped).length === 0 && (
        <Alert severity="info">No datasets found. Run a BigQuery sync to discover your data.</Alert>
      )}

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

      {/* Sync result dialog */}
      <Dialog
        open={syncDialog}
        onClose={() => { setSyncDialog(false); setSyncResult(null); setSyncError(null) }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{syncError ? 'Sync Failed' : 'BigQuery Sync Complete'}</DialogTitle>
        <DialogContent>
          {syncError ? (
            <Alert severity="error">{syncError}</Alert>
          ) : syncResult ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Alert severity="success">
                Successfully synced from <strong>{syncResult.project_id}</strong>
              </Alert>
              {[
                { label: 'Datasets added', value: syncResult.result.datasets_added },
                { label: 'Datasets updated', value: syncResult.result.datasets_updated },
                { label: 'Tables added', value: syncResult.result.tables_added },
                { label: 'Tables updated', value: syncResult.result.tables_updated },
                { label: 'Columns synced', value: syncResult.result.columns_synced },
              ].map(({ label, value }) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="body2" fontWeight={600}>{value}</Typography>
                </Box>
              ))}
              {syncResult.result.errors.length > 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {syncResult.result.errors.length} warning(s):
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {syncResult.result.errors.slice(0, 5).map((e, i) => (
                      <li key={i}><Typography variant="caption">{e}</Typography></li>
                    ))}
                  </ul>
                </Alert>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSyncDialog(false); setSyncResult(null); setSyncError(null) }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
