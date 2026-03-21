import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import SyncIcon from '@mui/icons-material/Sync'
import { bqApi } from '../api/bq'
import type { SyncResponse } from '../api/bq'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import FilterListIcon from '@mui/icons-material/FilterList'
import StorageIcon from '@mui/icons-material/Storage'
import TableChartIcon from '@mui/icons-material/TableChart'
import SensitivityChip from '../components/SensitivityChip'
import TagChip from '../components/TagChip'
import { datasetsApi } from '../api/datasets'
import { searchApi } from '../api/search'
import type { SensitivityLabel } from '../api/types'

const SENSITIVITY_OPTIONS = ['', 'public', 'internal', 'confidential', 'restricted']

export default function Browse() {
  const navigate = useNavigate()
  const [sensitivity, setSensitivity] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [syncDialog, setSyncDialog] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const qc = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: () => bqApi.sync(),
    onSuccess: (data) => {
      setSyncResult(data)
      setSyncDialog(true)
      qc.invalidateQueries({ queryKey: ['datasets'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (err: any) => {
      setSyncError(err.response?.data?.detail ?? 'Sync failed.')
      setSyncDialog(true)
    },
  })

  const { data: datasets, isLoading } = useQuery({
    queryKey: ['datasets', { sensitivity, tag: tagFilter }],
    queryFn: () =>
      datasetsApi.list({
        sensitivity_label: sensitivity || undefined,
        tags: tagFilter ? [tagFilter] : undefined,
        limit: 100,
      }),
  })

  const { data: allTags } = useQuery({ queryKey: ['tags'], queryFn: searchApi.tags })

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h5" fontWeight={700}>Browse Catalog</Typography>
        <Button
          variant="outlined"
          startIcon={syncMutation.isPending ? <CircularProgress size={16} /> : <SyncIcon />}
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          size="small"
        >
          {syncMutation.isPending ? 'Syncing from BigQuery…' : 'Sync from BigQuery'}
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="Sensitivity"
          value={sensitivity}
          onChange={(e) => setSensitivity(e.target.value)}
          sx={{ minWidth: 160 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <FilterListIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        >
          {SENSITIVITY_OPTIONS.map((opt) => (
            <MenuItem key={opt} value={opt}>{opt || 'All labels'}</MenuItem>
          ))}
        </TextField>

        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Tags:</Typography>
          {(allTags ?? []).slice(0, 10).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              variant={tagFilter === tag ? 'filled' : 'outlined'}
              color={tagFilter === tag ? 'primary' : 'default'}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              sx={{ cursor: 'pointer', fontSize: '0.7rem', height: 24 }}
            />
          ))}
        </Box>
      </Box>

      {/* Dataset list */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
        {isLoading ? '…' : `${datasets?.length ?? 0} dataset(s)`}
      </Typography>

      <Grid container spacing={2}>
        {isLoading
          ? [0, 1, 2, 3, 4, 5].map((i) => (
              <Grid item xs={12} sm={6} lg={4} key={i}>
                <Skeleton variant="rounded" height={160} />
              </Grid>
            ))
          : datasets?.map((ds) => (
              <Grid item xs={12} sm={6} lg={4} key={ds.id}>
                <Card
                  sx={{ cursor: 'pointer', height: '100%' }}
                  onClick={() => navigate(`/datasets/${ds.id}`)}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0, mr: 1 }}>
                        <StorageIcon sx={{ color: '#1a73e8', fontSize: 20, flexShrink: 0 }} />
                        <Typography variant="subtitle1" fontWeight={600} noWrap>
                          {ds.display_name || ds.dataset_id}
                        </Typography>
                      </Box>
                      <SensitivityChip label={ds.sensitivity_label as SensitivityLabel} />
                    </Box>

                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, pl: 3.5 }}>
                      {ds.project_id}.{ds.dataset_id}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 1.5,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        minHeight: 40,
                      }}
                    >
                      {ds.description || 'No description provided.'}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {ds.tags.slice(0, 3).map((t) => <TagChip key={t} tag={t} onClick={() => setTagFilter(t)} />)}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                        <TableChartIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption">{ds.table_count}</Typography>
                      </Box>
                    </Box>

                    {ds.owner && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        Owner: {ds.owner}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
      </Grid>

      {/* Sync result dialog */}
      <Dialog open={syncDialog} onClose={() => { setSyncDialog(false); setSyncResult(null); setSyncError(null) }} maxWidth="sm" fullWidth>
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
