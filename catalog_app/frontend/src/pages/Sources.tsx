import { useState, type FormEvent } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Skeleton, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ErrorIcon from '@mui/icons-material/Error'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import SyncIcon from '@mui/icons-material/Sync'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bqApi, type ProjectInfo, type SourceCreate } from '../api/bq'
import { errorDetail } from '../api/client'
import type { GCPSource } from '../api/types'
import ProjectPicker from '../components/ProjectPicker'
import { SyncProgressList, useSourceSync } from '../components/SourceSync'
import { EmptyState, MONO, MetaPill, PageHeader, formatDateTime } from '../components/ui'
import { tokens } from '../theme'

function SyncStatus({ source }: { source: GCPSource }) {
  const status = source.last_sync_status
  if (!status) return <MetaPill>Never synced</MetaPill>
  const pill = {
    ok: <MetaPill tone="success" icon={<CheckCircleIcon />}>Synced</MetaPill>,
    partial: <MetaPill tone="warning" icon={<WarningAmberIcon />}>Partial</MetaPill>,
    error: <MetaPill tone="danger" icon={<ErrorIcon />}>Failed</MetaPill>,
    running: <MetaPill tone="accent" icon={<CircularProgress size={10} color="inherit" />}>Running</MetaPill>,
  }[status] ?? <MetaPill>{status}</MetaPill>

  const s = source.last_sync_summary as { datasets_added?: number; tables_added?: number; tables_updated?: number; columns_synced?: number; errors?: unknown[] } | null
  const errors = Array.isArray(s?.errors) ? s.errors.length : 0
  return (
    <Box>
      {pill}
      {s && status !== 'running' && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          {[
            s.datasets_added ? `+${s.datasets_added} datasets` : null,
            `${((s.tables_added ?? 0) + (s.tables_updated ?? 0)).toLocaleString()} tables`,
            s.columns_synced != null ? `${s.columns_synced.toLocaleString()} columns` : null,
            errors ? `${errors} error${errors === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ')}
        </Typography>
      )}
    </Box>
  )
}

function AddSourceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const empty: SourceCreate = { project_id: '', display_name: '', secret_name: '' }
  const [form, setForm] = useState<SourceCreate>(empty)

  const mutation = useMutation({
    mutationFn: bqApi.addSource,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bq-sources'] })
      qc.invalidateQueries({ queryKey: ['gcp-projects'] })
      setForm(empty)
      onClose()
    },
    onError: () => {},
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.project_id.trim()) return
    mutation.mutate({
      project_id: form.project_id.trim(),
      display_name: form.display_name?.trim() || undefined,
      secret_name: form.secret_name?.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>Add a GCP project</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {mutation.isError && <Alert severity="error">{errorDetail(mutation.error, 'Could not add the project.')}</Alert>}
            <TextField
              label="GCP project ID" placeholder="my-gcp-project-123" required autoFocus fullWidth
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              InputProps={{ sx: MONO }}
            />
            <TextField
              label="Display name" placeholder="Analytics prod" fullWidth
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
            <TextField
              label="Service-account key secret (optional)" placeholder="bq-service-account-key" fullWidth
              helperText="A Secret Manager secret in this project that holds a service-account key. Leave empty to sync with your own Google account, or the catalog's Workload Identity when no Google token is on file."
              value={form.secret_name}
              onChange={(e) => setForm({ ...form, secret_name: e.target.value })}
              InputProps={{ sx: MONO }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!form.project_id.trim() || mutation.isPending}>
            {mutation.isPending ? <CircularProgress size={18} color="inherit" /> : 'Add project'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function DiscoverDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<ProjectInfo[]>([])

  const addMutation = useMutation({
    mutationFn: async (projects: ProjectInfo[]) => {
      for (const p of projects) {
        await bqApi.addSource({ project_id: p.project_id, display_name: p.display_name })
      }
    },
    onSuccess: () => {
      setSelected([])
      onClose()
    },
    // Some may have been added before one failed
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['bq-sources'] })
      qc.invalidateQueries({ queryKey: ['gcp-projects'] })
    },
    onError: () => {},
  })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Discover GCP projects</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Projects your Google account can see. Pick the ones to catalog.</Typography>
        {addMutation.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{errorDetail(addMutation.error, 'Could not add every project.')}</Alert>}
        <ProjectPicker enabled={open} selected={selected} onChange={setSelected} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={selected.length === 0 || addMutation.isPending} onClick={() => addMutation.mutate(selected)}>
          {addMutation.isPending
            ? <CircularProgress size={18} color="inherit" />
            : `Add ${selected.length || ''} project${selected.length === 1 ? '' : 's'}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function Sources() {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const sync = useSourceSync()

  const { data: sources = [], isLoading } = useQuery({ queryKey: ['bq-sources'], queryFn: bqApi.listSources })

  const deleteMutation = useMutation({
    mutationFn: bqApi.deleteSource,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bq-sources'] })
      qc.invalidateQueries({ queryKey: ['gcp-projects'] })
    },
  })
  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => bqApi.updateSource(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bq-sources'] }),
  })

  const activeCount = sources.filter((s) => s.is_active).length
  const startSync = (only?: GCPSource[]) => {
    setSyncOpen(true)
    sync.run(only)
  }

  return (
    <Box>
      <PageHeader
        eyebrow="Admin"
        title="GCP sources"
        subtitle="The Google Cloud projects whose BigQuery metadata is synced into the catalog."
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={sync.running ? <CircularProgress size={16} /> : <CloudSyncOutlinedIcon />}
              disabled={sync.running || activeCount === 0}
              onClick={() => startSync()}
            >
              Sync all
            </Button>
            <Button variant="outlined" startIcon={<ManageSearchIcon />} onClick={() => setDiscoverOpen(true)}>Discover</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add project</Button>
          </>
        }
      />

      {isLoading ? (
        <Skeleton variant="rounded" height={160} />
      ) : sources.length === 0 ? (
        <EmptyState
          icon={<CloudSyncOutlinedIcon />}
          title="No GCP projects connected"
          action={
            <>
              <Button variant="contained" startIcon={<ManageSearchIcon />} onClick={() => setDiscoverOpen(true)}>Discover projects</Button>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add by ID</Button>
            </>
          }
        >
          Connect a project to sync its BigQuery datasets and tables into the catalog.
        </EmptyState>
      ) : (
        <TableContainer sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface }}>
          <Table aria-label="GCP sources">
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell>Credentials</TableCell>
                <TableCell>Last sync</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((src) => {
                const name = src.display_name || src.project_id
                return (
                  <TableRow key={src.id} sx={{ opacity: src.is_active ? 1 : 0.65 }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{name}</Typography>
                      <Typography sx={{ ...MONO, fontSize: '0.75rem', color: tokens.ink3 }}>{src.project_id}</Typography>
                    </TableCell>
                    <TableCell>
                      {src.secret_name
                        ? <MetaPill mono title="Service-account key from Secret Manager">{src.secret_name}</MetaPill>
                        : <MetaPill title="Synced with the signed-in admin's Google account, or Workload Identity">Admin's Google account</MetaPill>}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: tokens.ink3 }}>{formatDateTime(src.last_synced_at)}</TableCell>
                    <TableCell sx={{ minWidth: 200 }}><SyncStatus source={src} /></TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={src.is_active}
                        inputProps={{ 'aria-label': `Include ${name} in Sync all` }}
                        onChange={(_, checked) => toggleMutation.mutate({ id: src.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Sync this project">
                        <span>
                          <IconButton size="small" aria-label={`Sync ${name}`} disabled={sync.running} onClick={() => startSync([src])}>
                            <SyncIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Remove project">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Remove ${name}`}
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(`Remove "${name}"? Its synced datasets and tables stay in the catalog.`)) deleteMutation.mutate(src.id)
                            }}
                            sx={{ '&:hover': { color: tokens.danger } }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <AddSourceDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <DiscoverDialog open={discoverOpen} onClose={() => setDiscoverOpen(false)} />
      <Dialog open={syncOpen} onClose={() => setSyncOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{sync.running ? 'Syncing from BigQuery…' : 'BigQuery sync'}</DialogTitle>
        <DialogContent>
          {sync.error && <Alert severity="error">{sync.error}</Alert>}
          <SyncProgressList rows={sync.rows} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSyncOpen(false)}>{sync.running ? 'Hide' : 'Close'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
