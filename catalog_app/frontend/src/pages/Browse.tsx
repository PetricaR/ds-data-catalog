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
import SyncIcon from '@mui/icons-material/Sync'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CloudIcon from '@mui/icons-material/Cloud'
import StorageIcon from '@mui/icons-material/Storage'
import TableChartIcon from '@mui/icons-material/TableChart'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import VerifiedIcon from '@mui/icons-material/Verified'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { datasetsApi } from '../api/datasets'
import { tablesApi } from '../api/tables'
import { bqApi } from '../api/bq'
import { schemaChangesApi } from '../api/schemaChanges'
import { searchApi } from '../api/search'
import type { SyncResponse } from '../api/bq'
import type { Dataset, SensitivityLabel } from '../api/types'

function ValidatedTablesList({ datasetId, onNavigate }: { datasetId: string; onNavigate: (tableId: string) => void }) {
  const { data: tables, isLoading } = useQuery({
    queryKey: ['dataset', datasetId, 'tables'],
    queryFn: () => tablesApi.list({ dataset_id: datasetId }),
  })

  const validated = (tables ?? []).filter((t) => t.is_validated)

  if (isLoading) {
    return (
      <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={12} />
        <Typography variant="caption" color="text.secondary">Loading…</Typography>
      </Box>
    )
  }

  if (validated.length === 0) {
    return (
      <Box sx={{ px: 3, py: 1.5 }}>
        <Typography variant="caption" color="text.secondary">No validated tables in this dataset.</Typography>
      </Box>
    )
  }

  return (
    <List dense disablePadding>
      {validated.map((t) => (
        <ListItemButton
          key={t.id}
          onClick={() => onNavigate(t.id)}
          sx={{ pl: 4, pr: 2, py: 0.75, '&:hover': { bgcolor: '#e8f5e9' } }}
        >
          <ListItemIcon sx={{ minWidth: 26 }}>
            <VerifiedIcon sx={{ fontSize: 14, color: '#2e7d32' }} />
          </ListItemIcon>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {t.table_id}
                </Typography>
                {t.display_name && t.display_name !== t.table_id && (
                  <Typography variant="caption" color="text.secondary">
                    {t.display_name}
                  </Typography>
                )}
              </Box>
            }
            secondary={
              t.validated_by ? (
                <Typography variant="caption" color="text.disabled">
                  Validated by {t.validated_by}
                  {t.validated_at ? ` · ${new Date(t.validated_at).toLocaleDateString()}` : ''}
                </Typography>
              ) : null
            }
          />
          <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
        </ListItemButton>
      ))}
    </List>
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
          startIcon={syncMutation.isPending ? <CircularProgress size={15} color="inherit" /> : <SyncIcon />}
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
            { icon: <StorageIcon />, value: stats.total_datasets, label: 'Datasets', color: '#1a73e8' },
            { icon: <TableChartIcon />, value: stats.total_tables, label: 'Tables', color: '#137333' },
            { icon: <ViewColumnIcon />, value: stats.total_columns, label: 'Columns', color: '#e37400' },
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
            defaultExpanded
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
                <CloudIcon sx={{ color: '#1a73e8', fontSize: 20 }} />
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
                      px: 2.5,
                      pt: 1.5,
                      pb: expandedValidated.has(ds.id) ? 1 : 1.5,
                      borderLeft: ds.is_validated ? '3px solid #2e7d32' : '3px solid transparent',
                      '&:hover': { bgcolor: '#fafbff' },
                      transition: 'background 0.15s',
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/datasets/${ds.id}`)}
                  >
                    {/* Line 1: icon + name + validated chip + spacer + actions */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StorageIcon sx={{ color: '#1a73e8', fontSize: 18, flexShrink: 0 }} />
                      <Typography variant="subtitle2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {ds.display_name || ds.dataset_id}
                      </Typography>
                      {ds.is_validated && (
                        <Tooltip title={`Validated${ds.validated_by ? ` by ${ds.validated_by}` : ''}${ds.validated_at ? ` on ${new Date(ds.validated_at).toLocaleDateString()}` : ''}`}>
                          <Chip
                            icon={<VerifiedIcon sx={{ fontSize: '12px !important' }} />}
                            label="Validated"
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ fontSize: '0.6rem', height: 18, cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                      <Box sx={{ flex: 1 }} />
                      {(ds.table_count ?? 0) > 0 && (
                        <Tooltip title={expandedValidated.has(ds.id) ? 'Hide validated tables' : 'Show validated tables'}>
                          <Button
                            size="small"
                            variant={expandedValidated.has(ds.id) ? 'outlined' : 'text'}
                            color={expandedValidated.has(ds.id) ? 'success' : 'inherit'}
                            startIcon={<VerifiedIcon sx={{ fontSize: '13px !important' }} />}
                            endIcon={
                              <ExpandMoreIcon
                                sx={{
                                  fontSize: '14px !important',
                                  transition: 'transform 0.2s',
                                  transform: expandedValidated.has(ds.id) ? 'rotate(180deg)' : 'none',
                                }}
                              />
                            }
                            onClick={(e) => toggleValidated(ds.id, e)}
                            sx={{
                              fontSize: '0.7rem',
                              textTransform: 'none',
                              minWidth: 0,
                              px: 1,
                              py: 0.25,
                              height: 24,
                              borderRadius: 1.5,
                              color: expandedValidated.has(ds.id) ? 'success.main' : 'text.secondary',
                            }}
                          >
                            Validated tables
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip title="Open dataset">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); navigate(`/datasets/${ds.id}`) }}
                          sx={{ color: 'text.disabled', '&:hover': { color: '#1a73e8' } }}
                        >
                          <OpenInNewIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>

                    {/* Line 2: monospace ID + chips */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, pl: 3.25, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled', mr: 0.5 }}>
                        {ds.project_id}.{ds.dataset_id}
                      </Typography>
                      <SensitivityChip label={ds.sensitivity_label as SensitivityLabel} />
                      <Chip
                        icon={<TableChartIcon sx={{ fontSize: '11px !important' }} />}
                        label={`${ds.table_count ?? 0} table${(ds.table_count ?? 0) !== 1 ? 's' : ''}`}
                        size="small"
                        sx={{ fontSize: '0.62rem', height: 18 }}
                      />
                      {ds.tags.slice(0, 4).map((t) => (
                        <TagChip key={t} tag={t} />
                      ))}
                    </Box>

                    {/* Line 3: description */}
                    {ds.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        sx={{ mt: 0.5, pl: 3.25, fontSize: '0.8rem' }}
                      >
                        {ds.description}
                      </Typography>
                    )}
                  </Box>

                  {/* Validated tables panel */}
                  <Collapse in={expandedValidated.has(ds.id)} unmountOnExit>
                    <Box
                      sx={{
                        bgcolor: '#f6faf6',
                        borderTop: '1px solid',
                        borderColor: '#c8e6c9',
                        borderLeft: '3px solid #2e7d32',
                        ml: 0,
                      }}
                    >
                      <Box sx={{ px: 2.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <VerifiedIcon sx={{ fontSize: 13, color: '#2e7d32' }} />
                        <Typography variant="caption" fontWeight={600} sx={{ color: '#2e7d32' }}>
                          Validated tables
                        </Typography>
                      </Box>
                      <Divider sx={{ borderColor: '#c8e6c9' }} />
                      <ValidatedTablesList
                        datasetId={ds.id}
                        onNavigate={(tableId) => navigate(`/datasets/${ds.id}/tables/${tableId}`)}
                      />
                    </Box>
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
