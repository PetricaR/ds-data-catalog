import { useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Checkbox, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, Paper,
  Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import SyncIcon from '@mui/icons-material/Sync'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import SearchIcon from '@mui/icons-material/ManageSearch'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import PendingIcon from '@mui/icons-material/HourglassEmpty'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bqApi, type ProjectInfo, type SourceCreate } from '../api/bq'
import type { GCPSource } from '../api/types'

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: GCPSource['last_sync_status'] }) {
  if (!status) return <Chip label="Never synced" size="small" variant="outlined" sx={{ color: 'text.disabled', borderColor: 'divider' }} />
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
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="GCP Project ID" placeholder="my-gcp-project-123"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            required fullWidth
          />
          <TextField
            label="Display Name" placeholder="Analytics Prod"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Secret Manager Secret Name" placeholder="bq-service-account-key"
            helperText="Leave empty to use your signed-in Google account credentials"
            value={form.secret_name}
            onChange={(e) => setForm({ ...form, secret_name: e.target.value })}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.project_id || mutation.isPending}
          onClick={() => mutation.mutate({ ...form, secret_name: form.secret_name || undefined, display_name: form.display_name || undefined })}
        >
          {mutation.isPending ? <CircularProgress size={18} color="inherit" /> : 'Add Source'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Discover dialog ───────────────────────────────────────────────────────────

function DiscoverDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['gcp-projects'],
    queryFn: bqApi.listAccessibleProjects,
    enabled: open,
    staleTime: 60_000,
  })

  const addMutation = useMutation({
    mutationFn: async (projectIds: string[]) => {
      for (const pid of projectIds) {
        const proj = projects.find((p) => p.project_id === pid)
        await bqApi.addSource({ project_id: pid, display_name: proj?.display_name })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bq-sources'] })
      setSelected(new Set())
      onClose()
    },
  })

  const toggle = (pid: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(pid) ? s.delete(pid) : s.add(pid); return s })

  const available = projects.filter((p) => !p.already_added)

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Discover GCP Projects</DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {String((error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to load projects')}
          </Alert>
        )}
        {!isLoading && !error && (
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {projects.filter((p) => p.already_added).map((p) => (
              <Box key={p.project_id} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1,
                borderRadius: 2, bgcolor: '#f8f9fa',
              }}>
                <CheckCircleIcon fontSize="small" color="success" />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>{p.display_name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{p.project_id}</Typography>
                </Box>
                <Chip label="Added" size="small" color="success" variant="outlined" />
              </Box>
            ))}
            {available.length === 0 && projects.length > 0 && (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">All accessible projects are already added.</Typography>
              </Box>
            )}
            {available.map((p) => (
              <FormControlLabel
                key={p.project_id}
                control={<Checkbox size="small" checked={selected.has(p.project_id)} onChange={() => toggle(p.project_id)} />}
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>{p.display_name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{p.project_id}</Typography>
                  </Box>
                }
                sx={{ mx: 0, px: 1, py: 0.5, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' }, width: '100%' }}
              />
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button
          variant="contained"
          disabled={selected.size === 0 || addMutation.isPending}
          onClick={() => addMutation.mutate([...selected])}
        >
          {addMutation.isPending
            ? <CircularProgress size={18} color="inherit" />
            : `Add ${selected.size > 0 ? selected.size : ''} Project${selected.size !== 1 ? 's' : ''}`
          }
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
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={2}>
          {results.map((r) => (
            <Box key={r.project_id}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>{r.project_id}</Typography>
              <Box component="pre" sx={{ fontSize: 12, bgcolor: '#f8f9fa', p: 1.5, borderRadius: 2, overflowX: 'auto', m: 0 }}>
                {JSON.stringify(r.result, null, 2)}
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} variant="outlined">Close</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Sources() {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: '#e8f0fe' }}>
            <CloudSyncIcon sx={{ color: '#1a73e8', fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>GCP Sources</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Manage BigQuery projects to sync metadata from
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={isBusy ? <CircularProgress size={16} /> : <CloudSyncIcon />}
            disabled={isBusy || sources.filter((s) => s.is_active).length === 0}
            onClick={() => syncAllMutation.mutate()}
          >
            Sync All
          </Button>
          <Button variant="outlined" startIcon={<SearchIcon />} onClick={() => setDiscoverOpen(true)}>
            Discover
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add Manually
          </Button>
        </Stack>
      </Box>

      {syncAllMutation.isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {String((syncAllMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Sync failed')}
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && sources.length === 0 && (
        <Box sx={{
          textAlign: 'center', py: 10, px: 4,
          border: '2px dashed #e8eaed', borderRadius: 3,
        }}>
          <CloudSyncIcon sx={{ fontSize: 52, color: '#dadce0', mb: 2 }} />
          <Typography variant="h6" gutterBottom>No GCP sources configured</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
            Connect a GCP project to start syncing BigQuery datasets and tables into the catalog.
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center">
            <Button variant="contained" startIcon={<SearchIcon />} onClick={() => setDiscoverOpen(true)}>
              Discover Projects
            </Button>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
              Add Manually
            </Button>
          </Stack>
        </Box>
      )}

      {/* Sources table */}
      {sources.length > 0 && (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e8eaed', borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Auth Method</TableCell>
                <TableCell>Last Sync</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Active</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((src) => (
                <TableRow key={src.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{src.display_name || src.project_id}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {src.project_id}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {src.secret_name
                      ? <Chip label={src.secret_name} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                      : <Chip label="User OAuth" size="small" color="info" variant="outlined" />
                    }
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {src.last_synced_at ? new Date(src.last_synced_at).toLocaleString() : '—'}
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
                      <Tooltip title="Sync this project" arrow>
                        <span>
                          <IconButton
                            size="small"
                            disabled={isBusy}
                            onClick={() => syncOneMutation.mutate(src.id)}
                            sx={{ color: 'text.secondary', '&:hover': { color: '#1a73e8' } }}
                          >
                            <SyncIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Remove source" arrow>
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

      {/* Last sync summary */}
      {sources.some((s) => s.last_sync_summary) && (
        <Box mt={3}>
          <Divider sx={{ mb: 2.5 }} />
          <Typography variant="subtitle2" color="text.secondary" gutterBottom fontWeight={600}>
            Last sync summary
          </Typography>
          <Stack spacing={1.5}>
            {sources.filter((s) => s.last_sync_summary).map((src) => {
              const s = src.last_sync_summary as Record<string, number>
              return (
                <Box key={src.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography variant="body2" fontWeight={600} sx={{ minWidth: 160, color: 'text.primary' }}>
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
                </Box>
              )
            })}
          </Stack>
        </Box>
      )}

      <AddSourceDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <DiscoverDialog open={discoverOpen} onClose={() => setDiscoverOpen(false)} />
      {syncResults && <SyncResultDialog results={syncResults} onClose={() => setSyncResults(null)} />}
    </Box>
  )
}
