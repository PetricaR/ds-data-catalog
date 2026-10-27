import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Chip, CircularProgress, Collapse, Divider, Paper, Step,
  StepContent, StepLabel, Stepper, TextField, Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import StorageIcon from '@mui/icons-material/Storage'
import LockIcon from '@mui/icons-material/Lock'
import CloudIcon from '@mui/icons-material/Cloud'
import SyncIcon from '@mui/icons-material/Sync'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import SchemaIcon from '@mui/icons-material/Schema'
import { authApi } from '../api/auth'
import { bqApi, type ProjectInfo } from '../api/bq'
import { setupApi, type SetupStatus } from '../api/setup'
import type { GCPSource } from '../api/types'
import ProjectPicker from '../components/ProjectPicker'
import { isAdmin, useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncRow {
  source: GCPSource
  state: 'pending' | 'running' | 'ok' | 'partial' | 'error'
  message?: string
}

function errorDetail(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  // Validation errors (422) carry a list, not a message
  return typeof detail === 'string' && detail ? detail : fallback
}

const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com'

// The client is checked with Google before it is saved; the secret is stored encrypted and never shown again.
function OAuthClientForm({ admin, onSaved }: { admin: boolean; onSaved: () => void }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const badClientId = clientId.trim() !== '' && !clientId.trim().endsWith(CLIENT_ID_SUFFIX)
  const ready = clientId.trim() && !badClientId && clientSecret.trim() && (admin || setupToken.trim())

  async function save() {
    setSaving(true)
    setError('')
    try {
      await setupApi.saveOAuthClient(
        { client_id: clientId.trim(), client_secret: clientSecret.trim() },
        admin ? undefined : setupToken.trim(),
      )
      setClientSecret('')
      onSaved()
    } catch (e) {
      setError(errorDetail(e, 'Could not save the OAuth client. Check the client ID and secret.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      component="form"
      autoComplete="off"
      onSubmit={(e: FormEvent) => { e.preventDefault(); if (ready) save() }}
      sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
    >
      <TextField
        label="Client ID"
        placeholder={`1234567890-abc${CLIENT_ID_SUFFIX}`}
        value={clientId}
        onChange={e => setClientId(e.target.value)}
        error={badClientId}
        helperText={badClientId ? `A Google client ID ends with ${CLIENT_ID_SUFFIX}` : undefined}
        size="small"
        fullWidth
        required
      />
      <TextField
        label="Client secret"
        type="password"
        autoComplete="new-password"
        value={clientSecret}
        onChange={e => setClientSecret(e.target.value)}
        size="small"
        fullWidth
        required
      />
      {!admin && (
        <TextField
          label="Setup token"
          type="password"
          autoComplete="off"
          value={setupToken}
          onChange={e => setSetupToken(e.target.value)}
          size="small"
          fullWidth
          required
          helperText={<>
            Printed in the backend log at startup, or run <code>python -m backend.setup_token</code> where the
            backend runs. It proves you operate this server; an admin who is signed in doesn't need it.
          </>}
        />
      )}
      {error && <Typography variant="body2" color="error">{error}</Typography>}
      <Button
        type="submit"
        variant="outlined"
        disabled={!ready || saving}
        startIcon={saving ? <CircularProgress size={16} /> : <LockIcon />}
        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
      >
        {saving ? 'Checking with Google…' : 'Verify and save'}
      </Button>
    </Box>
  )
}

function SignInPrompt() {
  const { user } = useAuth()
  if (user) {
    return (
      <Box sx={{ bgcolor: '#fef7e0', borderRadius: 1, p: 1.5 }}>
        <Typography variant="body2">
          Signed in as <strong>{user.email}</strong> ({user.role}). Ask an admin to finish setup.
        </Typography>
      </Box>
    )
  }
  return (
    <Box sx={{ bgcolor: '#e8f0fe', borderRadius: 1, p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Typography variant="body2" sx={{ flex: 1 }}>
        Sign in with an admin account (listed in <code>ADMIN_EMAILS</code>) to connect BigQuery projects.
      </Typography>
      <Button
        size="small"
        variant="contained"
        onClick={() => {
          authApi.setReturnTo('/setup')
          window.location.href = '/api/v1/auth/login'
        }}
        sx={{ textTransform: 'none' }}
      >
        Sign in
      </Button>
    </Box>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Chip
      size="small"
      icon={ok ? <CheckCircleIcon /> : <ErrorIcon />}
      label={label}
      color={ok ? 'success' : 'error'}
      variant="outlined"
      sx={{ fontWeight: 500 }}
    />
  )
}

function OptionalChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Chip
      size="small"
      icon={ok ? <CheckCircleIcon /> : <WarningAmberIcon />}
      label={label}
      color={ok ? 'success' : 'warning'}
      variant="outlined"
      sx={{ fontWeight: 500 }}
    />
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <Box
      component="pre"
      sx={{
        bgcolor: '#f1f3f4', borderRadius: 1, p: 1.5, mt: 1, mb: 1,
        fontSize: '0.78rem', fontFamily: 'monospace', overflowX: 'auto',
        whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#202124',
      }}
    >
      {children}
    </Box>
  )
}

function SyncRowIcon({ state }: { state: SyncRow['state'] }) {
  if (state === 'running') return <CircularProgress size={16} />
  if (state === 'ok') return <CheckCircleIcon color="success" fontSize="small" />
  if (state === 'partial') return <WarningAmberIcon color="warning" fontSize="small" />
  if (state === 'error') return <ErrorIcon color="error" fontSize="small" />
  return <HourglassEmptyIcon color="disabled" fontSize="small" />
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Setup() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const [activeStep, setActiveStep] = useState(0)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  // Step 1 — replace an OAuth client saved in the wizard
  const [replacingOAuth, setReplacingOAuth] = useState(false)

  // Step 2 — BQ sources
  const [selectedProjects, setSelectedProjects] = useState<ProjectInfo[]>([])
  const [manualEntry, setManualEntry] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [secretName, setSecretName] = useState('')
  const [addingSource, setAddingSource] = useState(false)
  const [addedProjects, setAddedProjects] = useState<string[]>([])
  const [sourceError, setSourceError] = useState('')

  // Step 3 — Sync, one source per request so each stays short
  const [syncing, setSyncing] = useState(false)
  const [syncRows, setSyncRows] = useState<SyncRow[]>([])
  const [syncError, setSyncError] = useState('')
  const [syncDone, setSyncDone] = useState(false)

  const sourcesCount = status?.bq_sources_count ?? 0
  const sourceAdded = addedProjects.length > 0

  // ── Load status ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setupApi.status()
      .then(s => {
        setStatus(s)
        // Resume wizard at the right step for existing installs
        if (!s.database_connected) {
          setActiveStep(0)
        } else if (!s.oauth_configured || !s.admin_configured || s.oauth_client_error) {
          setActiveStep(1)
        } else if (s.bq_sources_count === 0) {
          setActiveStep(2)
        } else if (!s.has_data) {
          setActiveStep(3)
        } else {
          setActiveStep(4) // already set up
        }
      })
      .catch(() => setStatus(null))
      .finally(() => setLoadingStatus(false))
  }, [])

  // ── Step actions ─────────────────────────────────────────────────────────────

  function oauthSaved() {
    setReplacingOAuth(false)
    setupApi.status().then(setStatus).catch(() => {})
  }

  async function addSources(sources: { project_id: string; display_name?: string; secret_name?: string }[]) {
    setAddingSource(true)
    setSourceError('')
    const added: string[] = []
    try {
      for (const source of sources) {
        await bqApi.addSource(source)
        added.push(source.project_id)
      }
    } catch (e) {
      setSourceError(errorDetail(e, 'Failed to add source. Check the project ID and try again.'))
    } finally {
      if (added.length) {
        setAddedProjects(prev => [...prev, ...added])
        setStatus(s => s ? { ...s, bq_sources_count: s.bq_sources_count + added.length } : s)
        setSelectedProjects([])
        qc.invalidateQueries({ queryKey: ['gcp-projects'] })
        qc.invalidateQueries({ queryKey: ['bq-sources'] })
      }
      setAddingSource(false)
    }
  }

  function addSelectedProjects() {
    addSources(selectedProjects.map(p => ({ project_id: p.project_id, display_name: p.display_name })))
  }

  function addManualProject() {
    if (!projectId.trim()) return
    addSources([{
      project_id: projectId.trim(),
      display_name: displayName.trim() || projectId.trim(),
      ...(secretName.trim() ? { secret_name: secretName.trim() } : {}),
    }])
  }

  async function runSync() {
    setSyncing(true)
    setSyncError('')
    let sources: GCPSource[]
    try {
      sources = (await bqApi.listSources()).filter(s => s.is_active)
    } catch (e) {
      setSyncError(errorDetail(e, 'Could not load the connected projects.'))
      setSyncing(false)
      return
    }
    if (!sources.length) {
      setSyncError('No active BigQuery projects to sync. Add one in the previous step.')
      setSyncing(false)
      return
    }

    const update = (index: number, row: Partial<SyncRow>) =>
      setSyncRows(rows => rows.map((r, i) => i === index ? { ...r, ...row } : r))
    setSyncRows(sources.map(source => ({ source, state: 'pending' })))

    for (const [index, source] of sources.entries()) {
      update(index, { state: 'running' })
      try {
        const { result } = await bqApi.syncSource(source.id)
        const tables = result.tables_added + result.tables_updated
        update(index, result.errors.length
          ? { state: tables ? 'partial' : 'error', message: result.errors.join('; ') }
          : { state: 'ok', message: `${tables} table${tables === 1 ? '' : 's'} synced` })
      } catch (e) {
        update(index, {
          state: 'error',
          message: errorDetail(e, 'The request failed or timed out — a large project may still be syncing. Check GCP Sources in a few minutes.'),
        })
      }
    }

    setupApi.status().then(setStatus).catch(() => {})
    qc.invalidateQueries({ queryKey: ['bq-sources'] })
    setSyncDone(true)
    setSyncing(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loadingStatus) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#f8f9fa' }}>
        <CircularProgress />
      </Box>
    )
  }

  const steps = [
    { label: 'System Check', icon: <StorageIcon /> },
    { label: 'Google Authentication', icon: <LockIcon /> },
    { label: 'Connect BigQuery', icon: <CloudIcon /> },
    { label: 'Sync Data', icon: <SyncIcon /> },
    { label: "You're ready!", icon: <RocketLaunchIcon /> },
  ]

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#1a73e8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SchemaIcon sx={{ color: '#fff', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>Light Data Catalog</Typography>
          <Typography variant="body2" color="text.secondary">Setup wizard</Typography>
        </Box>
      </Box>

      <Paper elevation={0} sx={{ width: '100%', maxWidth: 640, border: '1px solid #e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ px: 4, pt: 3, pb: 1, borderBottom: '1px solid #f0f0f0' }}>
          <Typography variant="h6" fontWeight={600}>Welcome! Let's get you set up.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            This wizard will guide you through configuring Light Data Catalog for your organization.
          </Typography>
        </Box>

        <Box sx={{ px: 4, py: 3 }}>
          <Stepper activeStep={activeStep} orientation="vertical" sx={{ '& .MuiStepConnector-line': { minHeight: 12 } }}>

            {/* ── Step 0: System Check ────────────────────────────────────────── */}
            <Step completed={activeStep > 0}>
              <StepLabel StepIconProps={{ icon: steps[0].icon }}>
                <Typography fontWeight={600}>System Check</Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Verifying that all core services are running.
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                    <StatusChip ok={status !== null} label="API reachable" />
                    <StatusChip ok={status?.database_connected ?? false} label="Database connected" />
                  </Box>
                  {!status?.database_connected && (
                    <Box sx={{ bgcolor: '#fce8e6', borderRadius: 1, p: 1.5 }}>
                      <Typography variant="body2" color="error.main" fontWeight={500}>
                        Cannot connect to the database. Check that PostgreSQL is running and DATABASE_URL is correct.
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Button
                  variant="contained"
                  disabled={!status?.database_connected}
                  onClick={() => setActiveStep(1)}
                  sx={{ textTransform: 'none' }}
                >
                  Continue
                </Button>
              </StepContent>
            </Step>

            {/* ── Step 1: Google OAuth ─────────────────────────────────────────── */}
            <Step completed={activeStep > 1}>
              <StepLabel StepIconProps={{ icon: steps[1].icon }}>
                <Typography fontWeight={600}>Google Authentication</Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {status?.oauth_client_error ? (
                      <StatusChip ok={false} label="Google rejects the OAuth client" />
                    ) : (
                      <StatusChip ok={status?.oauth_configured ?? false} label={status?.oauth_configured ? 'OAuth client configured' : 'OAuth client not configured'} />
                    )}
                    <StatusChip ok={status?.admin_configured ?? false} label={status?.admin_configured ? 'Admin account set' : 'No admin account'} />
                  </Box>

                  {status?.oauth_client_error ? (
                    <Box sx={{ bgcolor: '#fce8e6', borderRadius: 1, p: 1.5 }}>
                      <Typography variant="body2" color="error.main" fontWeight={500}>
                        Google rejects the configured OAuth client: {status.oauth_client_error}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {status.oauth_source === 'environment'
                          ? <>Restore it in Google Cloud (Google Auth Platform → Clients), or create a new one and update <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> on the backend, then restart it. To enter it here instead, remove both variables and restart.</>
                          : 'Restore it in Google Cloud (Google Auth Platform → Clients), or create a new one and enter it below.'}
                      </Typography>
                    </Box>
                  ) : status?.oauth_configured ? (
                    <Typography variant="body2" color="text.secondary">
                      {status.oauth_source === 'environment'
                        ? <>Google sign-in uses the OAuth client from the <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> environment
                            variables. To manage it here instead, remove both and restart the backend.</>
                        : 'Google sign-in uses the OAuth client saved in this wizard. Its secret is stored encrypted.'}
                    </Typography>
                  ) : status?.oauth_source === 'environment' ? (
                    <Typography variant="body2" color="text.secondary">
                      Only one of <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> is set on the backend.
                      Set both, or remove both to enter the client here, then restart the backend.
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Google sign-in is required — every page and API call needs a signed-in user. Create an OAuth
                      client in Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application),
                      then enter its client ID and secret below.
                    </Typography>
                  )}
                  {status?.redirect_uri && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        The OAuth client must list this as an authorized redirect URI (it is built from <code>FRONTEND_URL</code>):
                      </Typography>
                      <CodeBlock>{status.redirect_uri}</CodeBlock>
                    </>
                  )}
                  {(!status?.oauth_configured || status?.oauth_client_error) && status?.oauth_source !== 'environment' && (
                    <OAuthClientForm admin={admin} onSaved={oauthSaved} />
                  )}
                  {status?.oauth_configured && !status.oauth_client_error && status.oauth_source === 'database' && (
                    <>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setReplacingOAuth(r => !r)}
                        sx={{ textTransform: 'none', alignSelf: 'flex-start', color: 'text.secondary' }}
                      >
                        {replacingOAuth ? 'Keep the current OAuth client' : 'Replace the OAuth client (e.g. after it was deleted in Google Cloud)'}
                      </Button>
                      <Collapse in={replacingOAuth} unmountOnExit>
                        <OAuthClientForm admin={admin} onSaved={oauthSaved} />
                      </Collapse>
                    </>
                  )}
                  {!status?.admin_configured && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Name the admin accounts on the backend, then restart it:
                      </Typography>
                      <CodeBlock>ADMIN_EMAILS=you@yourcompany.com</CodeBlock>
                    </>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    disabled={!status?.oauth_configured || !status?.admin_configured || !!status?.oauth_client_error}
                    onClick={() => setActiveStep(2)}
                    sx={{ textTransform: 'none' }}
                  >
                    Continue
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* ── Step 2: Add BQ Sources ────────────────────────────────────────── */}
            <Step completed={activeStep > 2 || sourceAdded || sourcesCount > 0}>
              <StepLabel StepIconProps={{ icon: steps[2].icon }}>
                <Typography fontWeight={600}>Connect BigQuery</Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                  {sourcesCount > 0 && !sourceAdded ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon color="success" fontSize="small" />
                      <Typography variant="body2" color="success.main" fontWeight={500}>
                        {sourcesCount} BigQuery source{sourcesCount > 1 ? 's' : ''} already connected.
                      </Typography>
                    </Box>
                  ) : sourceAdded ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon color="success" fontSize="small" />
                      <Typography variant="body2" color="success.main" fontWeight={500}>
                        Added <strong>{addedProjects.join(', ')}</strong>.
                      </Typography>
                    </Box>
                  ) : !admin ? (
                    <SignInPrompt />
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Pick the GCP projects to catalog. Light Data Catalog will sync all their BigQuery datasets and tables.
                      </Typography>
                      <ProjectPicker enabled={activeStep === 2} selected={selectedProjects} onChange={setSelectedProjects} />
                      <Button
                        variant="outlined"
                        onClick={addSelectedProjects}
                        disabled={selectedProjects.length === 0 || addingSource}
                        startIcon={addingSource && !manualEntry ? <CircularProgress size={16} /> : <CloudIcon />}
                        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                      >
                        {`Add ${selectedProjects.length || ''} Project${selectedProjects.length === 1 ? '' : 's'}`}
                      </Button>

                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setManualEntry(m => !m)}
                        sx={{ textTransform: 'none', alignSelf: 'flex-start', color: 'text.secondary' }}
                      >
                        {manualEntry ? 'Hide manual entry' : 'Project not listed? Enter a project ID manually'}
                      </Button>
                      <Collapse in={manualEntry}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <TextField
                            label="GCP Project ID"
                            placeholder="my-gcp-project"
                            value={projectId}
                            onChange={e => setProjectId(e.target.value)}
                            size="small"
                            fullWidth
                            required
                            helperText="The GCP project ID, e.g. my-company-data"
                          />
                          <TextField
                            label="Display Name (optional)"
                            placeholder="My Data Project"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            size="small"
                            fullWidth
                          />
                          <TextField
                            label="Service Account Secret Name (optional)"
                            placeholder="bq-sa-key"
                            value={secretName}
                            onChange={e => setSecretName(e.target.value)}
                            size="small"
                            fullWidth
                            helperText="Name of a Secret Manager secret in this project that holds a service account key JSON. Leave blank to use Workload Identity / ADC."
                          />
                          <Button
                            variant="outlined"
                            onClick={addManualProject}
                            disabled={!projectId.trim() || addingSource}
                            startIcon={addingSource && manualEntry ? <CircularProgress size={16} /> : <CloudIcon />}
                            sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                          >
                            {addingSource && manualEntry ? 'Adding…' : 'Add Project'}
                          </Button>
                        </Box>
                      </Collapse>
                    </>
                  )}
                  {sourceError && (
                    <Typography variant="body2" color="error">{sourceError}</Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    disabled={sourcesCount === 0 && !sourceAdded}
                    onClick={() => setActiveStep(3)}
                    sx={{ textTransform: 'none' }}
                  >
                    Continue
                  </Button>
                  {sourcesCount === 0 && !sourceAdded && (
                    <Button variant="text" onClick={() => setActiveStep(3)} sx={{ textTransform: 'none', color: 'text.secondary' }}>
                      Skip
                    </Button>
                  )}
                </Box>
              </StepContent>
            </Step>

            {/* ── Step 3: Sync Data ─────────────────────────────────────────────── */}
            <Step completed={activeStep > 3 || syncDone || status?.has_data}>
              <StepLabel StepIconProps={{ icon: steps[3].icon }}>
                <Typography fontWeight={600}>Sync Data from BigQuery</Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                  {status?.has_data && !syncRows.length ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon color="success" fontSize="small" />
                      <Typography variant="body2" color="success.main" fontWeight={500}>
                        Data is already synced. Your catalog has datasets and tables.
                      </Typography>
                    </Box>
                  ) : syncRows.length ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {syncDone && (
                        <Typography variant="body2" fontWeight={500}>Sync finished.</Typography>
                      )}
                      {syncRows.map(row => (
                        <Box key={row.source.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                          <Box sx={{ pt: 0.25 }}><SyncRowIcon state={row.state} /></Box>
                          <Typography variant="body2">
                            <strong>{row.source.display_name || row.source.project_id}</strong>
                            {row.state === 'pending' && ' — waiting'}
                            {row.state === 'running' && ' — syncing…'}
                            {row.message && ` — ${row.message}`}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : !admin ? (
                    <SignInPrompt />
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Sync will import all BigQuery datasets and tables from your connected GCP projects into the catalog.
                        Projects are synced one at a time; large projects can take a few minutes.
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={runSync}
                        disabled={syncing || (sourcesCount === 0 && !sourceAdded)}
                        startIcon={<SyncIcon />}
                        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                      >
                        Run First Sync
                      </Button>
                      {sourcesCount === 0 && !sourceAdded && (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          Add a BigQuery project in the previous step to enable sync.
                        </Typography>
                      )}
                    </>
                  )}
                  {syncError && (
                    <Typography variant="body2" color="error">{syncError}</Typography>
                  )}
                </Box>
                <Button
                  variant="contained"
                  disabled={syncing}
                  onClick={() => setActiveStep(4)}
                  sx={{ textTransform: 'none' }}
                >
                  Continue
                </Button>
              </StepContent>
            </Step>

            {/* ── Step 4: Done ──────────────────────────────────────────────────── */}
            <Step>
              <StepLabel StepIconProps={{ icon: steps[4].icon }}>
                <Typography fontWeight={600}>You're ready!</Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Light Data Catalog is set up. Here's a summary of your configuration:
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <StatusChip ok={status?.database_connected ?? false} label="Database" />
                    <StatusChip ok={!!status?.oauth_configured && !status.oauth_client_error} label="Google Login" />
                    <StatusChip ok={sourcesCount > 0} label="BigQuery" />
                    <OptionalChip ok={status?.team_access_configured ?? false} label="Team access" />
                    <OptionalChip ok={status?.gemini_configured ?? false} label="Gemini API key" />
                    <OptionalChip ok={status?.gchat_configured ?? false} label="Google Chat" />
                  </Box>

                  {(!status?.team_access_configured || !status?.gemini_configured || !status?.gchat_configured) && (
                    <>
                      <Divider />
                      <Typography variant="body2" fontWeight={500}>Optional settings you can configure later:</Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
                        {!status?.team_access_configured && (
                          <li><Typography variant="body2">
                            <strong>Team access</strong> — only <code>ADMIN_EMAILS</code> can sign in so far; set <code>ALLOWED_EMAIL_DOMAINS</code> (or <code>ALLOWED_EMAILS</code>) to let your team in
                          </Typography></li>
                        )}
                        {!status?.gemini_configured && (
                          <li><Typography variant="body2">
                            <strong>AI Insights</strong> — run on Vertex AI by default; set <code>GEMINI_API_KEY</code> to use the Gemini API instead
                          </Typography></li>
                        )}
                        {!status?.gchat_configured && (
                          <li><Typography variant="body2">
                            <strong>Google Chat alerts</strong> — set <code>GOOGLE_CHAT_WEBHOOK_URL</code> for change notifications
                          </Typography></li>
                        )}
                      </Box>
                    </>
                  )}
                </Box>

                <Button
                  variant="contained"
                  size="large"
                  startIcon={<RocketLaunchIcon />}
                  onClick={() => navigate('/browse')}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Open Light Data Catalog
                </Button>
              </StepContent>
            </Step>

          </Stepper>
        </Box>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 3 }}>
        You can revisit this page anytime at <strong>/setup</strong>
      </Typography>
    </Box>
  )
}
