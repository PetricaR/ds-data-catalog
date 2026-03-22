import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import SyncIcon from '@mui/icons-material/Sync'
import SyncAllIcon from '@mui/icons-material/CloudSync'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import PendingIcon from '@mui/icons-material/HourglassEmpty'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bqApi, type SourceCreate } from '../api/bq'
import type { GCPSource } from '../api/types'

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: GCPSource['last_sync_status'] }) {
  if (!status) return <Chip label="Never synced" size="small" variant="outlined" />
  const map: Record<string, { color: 'success' | 'error' | 'warning' | 'default'; icon: React.ReactElement }> = {
    ok:      { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
    partial: { color: 'warning', icon: <PendingIcon fontSize="small" /> },
    error:   { color: 'error',   icon: <ErrorIcon fontSize="small" /> },
    running: { color: 'default', icon: <CircularProgress size={12} /> },
  }
  const { color, icon } = map[status] ?? { color: 'default', icon: <PendingIcon fontSize="small" /> }
  return <Chip label={status} size="small" color={color} icon={icon} />
}

// ── Add source dialog ─────────────────────────────────────────────────────────

function AddSourceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<SourceCreate>({ project_id: '', display_name: '', secret_name: '' })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: bqApi.addSource,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bq-sources'] })
      setForm({ project_id: '', display_name: '', secret_name: '' })
      setError('')
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Failed to add source')
    },
  })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add GCP Project Source</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="GCP Project ID"
            placeholder="my-gcp-project-123"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="Display Name"
            placeholder="Analytics Prod"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Secret Manager Secret Name"
            placeholder="bq-service-account-key"
            helperText="Leave empty to use Workload Identity / Application Default Credentials"
            value={form.secret_name}
            onChange={(e) => setForm({ ...form, secret_name: e.target.value })}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.project_id || mutation.isPending}
          onClick={() => mutation.mutate({ ...form, secret_name: form.secret_name || undefined, display_name: form.display_name || undefined })}
        >
          {mutation.isPending ? <CircularProgress size={18} /> : 'Add Source'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Sync result dialog ────────────────────────────────────────────────────────

function SyncResultDialog({ results, onClose }: { results: { project_id: string; result: Record<string, unknown> }[]; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Sync Results</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {results.map((r) => (
            <Box key={r.project_id}>
              <Typography variant="subtitle2" fontWeight={600}>{r.project_id}</Typography>
              <Box component="pre" sx={{ fontSize: 12, bgcolor: 'grey.100', p: 1, borderRadius: 1, overflowX: 'auto' }}>
                {JSON.stringify(r.result, null, 2)}
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Sources() {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [syncResults, setSyncResults] = useState<{ project_id: string; result: Record<string, unknown> }[] | null>(null)

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['bq-sources'],
    queryFn: bqApi.listSources,
  })

  const deleteMutation = useMutation({
    mutationFn: bqApi.deleteSource,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bq-sources'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      bqApi.updateSource(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bq-sources'] }),
  })

  const syncOneMutation = useMutation({
    mutationFn: bqApi.syncSource,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['bq-sources'] })
      setSyncResults([{ project_id: data.project_id, result: data.result as unknown as Record<string, unknown> }])
    },
  })

  const syncAllMutation = useMutation({
    mutationFn: bqApi.syncAll,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['bq-sources'] })
      setSyncResults(data.map((d) => ({ project_id: d.project_id, result: d.result as unknown as Record<string, unknown> })))
    },
  })

  const isBusy = syncAllMutation.isPending || syncOneMutation.isPending

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>GCP Sources</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Manage GCP projects to sync BigQuery metadata from
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={isBusy ? <CircularProgress size={16} /> : <SyncAllIcon />}
            disabled={isBusy || sources.filter((s) => s.is_active).length === 0}
            onClick={() => syncAllMutation.mutate()}
          >
            Sync All
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add Project
          </Button>
        </Stack>
      </Stack>

      {/* Error banners */}
      {syncAllMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {String((syncAllMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Sync failed')}
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && sources.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: 'divider' }}>
          <SyncAllIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" gutterBottom>No GCP sources configured</Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Add a GCP project to start syncing BigQuery datasets and tables into the catalog.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add your first project
          </Button>
        </Paper>
      )}

      {/* Sources table */}
      {sources.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Auth</TableCell>
                <TableCell>Last Sync</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((src) => (
                <TableRow key={src.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{src.display_name || src.project_id}</Typography>
                    <Typography variant="caption" color="text.secondary">{src.project_id}</Typography>
                  </TableCell>
                  <TableCell>
                    {src.secret_name
                      ? <Chip label={src.secret_name} size="small" variant="outlined" />
                      : <Chip label="Workload Identity" size="small" color="info" variant="outlined" />}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {src.last_synced_at
                        ? new Date(src.last_synced_at).toLocaleString()
                        : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={src.last_sync_status} />
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={src.is_active}
                      onChange={(_, checked) => toggleMutation.mutate({ id: src.id, is_active: checked })}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Sync this project">
                        <span>
                          <IconButton
                            size="small"
                            disabled={isBusy}
                            onClick={() => syncOneMutation.mutate(src.id)}
                          >
                            <SyncIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Remove source">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(`Remove "${src.display_name || src.project_id}"? Synced data is kept.`))
                                deleteMutation.mutate(src.id)
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Last sync summary (if available) */}
      {sources.some((s) => s.last_sync_summary) && (
        <Box mt={3}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Last sync summary
          </Typography>
          <Stack spacing={1}>
            {sources.filter((s) => s.last_sync_summary).map((src) => {
              const s = src.last_sync_summary as Record<string, number>
              return (
                <Stack key={src.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="caption" fontWeight={600} sx={{ minWidth: 160 }}>
                    {src.display_name || src.project_id}
                  </Typography>
                  {[
                    { label: `+${s.datasets_added} datasets`, color: 'success' },
                    { label: `~${s.datasets_updated} updated`, color: 'default' },
                    { label: `+${s.tables_added} tables`, color: 'success' },
                    { label: `${s.columns_synced} columns`, color: 'info' },
                  ].map(({ label, color }) => (
                    <Chip key={label} label={label} size="small" color={color as 'success' | 'default' | 'info'} variant="outlined" />
                  ))}
                  {Array.isArray(s.errors) && (s.errors as unknown[]).length > 0 && (
                    <Chip label={`${(s.errors as unknown[]).length} errors`} size="small" color="error" variant="outlined" />
                  )}
                </Stack>
              )
            })}
          </Stack>
        </Box>
      )}

      {/* Dialogs */}
      <AddSourceDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {syncResults && <SyncResultDialog results={syncResults} onClose={() => setSyncResults(null)} />}
    </Box>
  )
}
