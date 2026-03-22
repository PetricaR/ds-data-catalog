import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Chip, CircularProgress, Divider, Paper, Step,
  StepContent, StepLabel, Stepper, TextField, Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import StorageIcon from '@mui/icons-material/Storage'
import LockIcon from '@mui/icons-material/Lock'
import CloudIcon from '@mui/icons-material/Cloud'
import SyncIcon from '@mui/icons-material/Sync'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import SchemaIcon from '@mui/icons-material/Schema'
import axios from 'axios'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SetupStatus {
  database_connected: boolean
  oauth_configured: boolean
  bq_sources_count: number
  has_data: boolean
  gemini_configured: boolean
  gchat_configured: boolean
  gcp_project_id: string
  is_fresh_install: boolean
}

interface SyncResult {
  project_id: string
  tables_synced: number
  error?: string
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

// ── Main component ────────────────────────────────────────────────────────────

export default function Setup() {
  const navigate = useNavigate()
  const [activeStep, setActiveStep] = useState(0)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  // Step 2 — BQ source form
  const [projectId, setProjectId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [secretName, setSecretName] = useState('')
  const [addingSource, setAddingSource] = useState(false)
  const [sourceAdded, setSourceAdded] = useState(false)
  const [sourceError, setSourceError] = useState('')

  // Step 3 — Sync
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<SyncResult[]>([])
  const [syncError, setSyncError] = useState('')
  const [syncDone, setSyncDone] = useState(false)

  // ── Load status ──────────────────────────────────────────────────────────────

  useEffect(() => {
    axios.get('/api/v1/setup/status')
      .then(r => {
        setStatus(r.data)
        // Resume wizard at the right step for existing installs
        if (!r.data.database_connected) {
          setActiveStep(0)
        } else if (r.data.bq_sources_count === 0) {
          setActiveStep(2)
        } else if (!r.data.has_data) {
          setActiveStep(3)
        } else {
          setActiveStep(4) // already set up
        }
      })
      .catch(() => setStatus(null))
      .finally(() => setLoadingStatus(false))
  }, [])

  // ── Step actions ─────────────────────────────────────────────────────────────

  async function addSource() {
    if (!projectId.trim()) return
    setAddingSource(true)
    setSourceError('')
    try {
      await axios.post('/api/v1/bq/sources', {
        project_id: projectId.trim(),
        display_name: displayName.trim() || projectId.trim(),
        ...(secretName.trim() ? { secret_name: secretName.trim() } : {}),
      })
      setSourceAdded(true)
      setStatus(s => s ? { ...s, bq_sources_count: s.bq_sources_count + 1 } : s)
    } catch (e: any) {
      setSourceError(e?.response?.data?.detail || 'Failed to add source. Check the project ID and try again.')
    } finally {
      setAddingSource(false)
    }
  }

  async function runSync() {
    setSyncing(true)
    setSyncError('')
    try {
      const r = await axios.post('/api/v1/bq/sync/all')
      setSyncResults(r.data)
      setSyncDone(true)
      setStatus(s => s ? { ...s, has_data: true } : s)
    } catch (e: any) {
      setSyncError(e?.response?.data?.detail || 'Sync failed. Check your GCP credentials and project configuration.')
    } finally {
      setSyncing(false)
    }
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
                    <StatusChip ok label="API reachable" />
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
                    <StatusChip ok={status?.oauth_configured ?? false} label={status?.oauth_configured ? 'OAuth configured' : 'OAuth not configured'} />
                  </Box>

                  {status?.oauth_configured ? (
                    <Typography variant="body2" color="text.secondary">
                      Google OAuth credentials are set. Users can sign in with their Google account.
                    </Typography>
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        To enable Google login, create OAuth 2.0 credentials in Google Cloud Console and set these environment variables on the backend:
                      </Typography>
                      <CodeBlock>{`GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret`}</CodeBlock>
                      <Typography variant="body2" color="text.secondary">
                        In Google Cloud Console → APIs & Services → Credentials, add this as an authorized redirect URI:
                      </Typography>
                      <CodeBlock>{`${window.location.origin}/api/v1/auth/callback`}</CodeBlock>
                      <Box sx={{ bgcolor: '#fff8e1', borderRadius: 1, p: 1.5 }}>
                        <Typography variant="body2" color="warning.dark">
                          You can skip this step for local development — the app will still work, but login won't be available.
                        </Typography>
                      </Box>
                    </>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="contained" onClick={() => setActiveStep(2)} sx={{ textTransform: 'none' }}>
                    {status?.oauth_configured ? 'Continue' : 'Skip for now'}
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* ── Step 2: Add BQ Source ─────────────────────────────────────────── */}
            <Step completed={activeStep > 2 || sourceAdded || (status?.bq_sources_count ?? 0) > 0}>
              <StepLabel StepIconProps={{ icon: steps[2].icon }}>
                <Typography fontWeight={600}>Connect BigQuery</Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                  {(status?.bq_sources_count ?? 0) > 0 && !sourceAdded ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon color="success" fontSize="small" />
                      <Typography variant="body2" color="success.main" fontWeight={500}>
                        {status!.bq_sources_count} BigQuery source{status!.bq_sources_count > 1 ? 's' : ''} already connected.
                      </Typography>
                    </Box>
                  ) : sourceAdded ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon color="success" fontSize="small" />
                      <Typography variant="body2" color="success.main" fontWeight={500}>
                        Project <strong>{projectId}</strong> added successfully!
                      </Typography>
                    </Box>
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Add your first GCP project. Light Data Catalog will sync all BigQuery datasets and tables from this project.
                      </Typography>
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
                        placeholder="projects/123/secrets/bq-sa-key"
                        value={secretName}
                        onChange={e => setSecretName(e.target.value)}
                        size="small"
                        fullWidth
                        helperText="Secret Manager path to a service account key JSON. Leave blank to use Workload Identity / ADC."
                      />
                      {sourceError && (
                        <Typography variant="body2" color="error">{sourceError}</Typography>
                      )}
                      <Button
                        variant="outlined"
                        onClick={addSource}
                        disabled={!projectId.trim() || addingSource}
                        startIcon={addingSource ? <CircularProgress size={16} /> : <CloudIcon />}
                        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                      >
                        {addingSource ? 'Adding…' : 'Add Project'}
                      </Button>
                    </>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    disabled={(status?.bq_sources_count ?? 0) === 0 && !sourceAdded}
                    onClick={() => setActiveStep(3)}
                    sx={{ textTransform: 'none' }}
                  >
                    Continue
                  </Button>
                  {(status?.bq_sources_count ?? 0) === 0 && !sourceAdded && (
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
                  {status?.has_data && !syncDone ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon color="success" fontSize="small" />
                      <Typography variant="body2" color="success.main" fontWeight={500}>
                        Data is already synced. Your catalog has datasets and tables.
                      </Typography>
                    </Box>
                  ) : syncDone ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography variant="body2" fontWeight={500} color="success.main">Sync complete!</Typography>
                      {syncResults.map(r => (
                        <Box key={r.project_id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          {r.error
                            ? <ErrorIcon color="error" fontSize="small" />
                            : <CheckCircleIcon color="success" fontSize="small" />
                          }
                          <Typography variant="body2">
                            {r.project_id}: {r.error ? r.error : `${r.tables_synced} tables synced`}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Sync will import all BigQuery datasets and tables from your connected GCP projects into the catalog.
                        This may take a moment depending on the number of tables.
                      </Typography>
                      {syncError && (
                        <Typography variant="body2" color="error">{syncError}</Typography>
                      )}
                      <Button
                        variant="outlined"
                        onClick={runSync}
                        disabled={syncing || (status?.bq_sources_count ?? 0) === 0}
                        startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                      >
                        {syncing ? 'Syncing…' : 'Run First Sync'}
                      </Button>
                      {(status?.bq_sources_count ?? 0) === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          Add a BigQuery project in the previous step to enable sync.
                        </Typography>
                      )}
                    </>
                  )}
                </Box>
                <Button
                  variant="contained"
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
                    <StatusChip ok={status?.oauth_configured ?? false} label="Google Login" />
                    <StatusChip ok={(status?.bq_sources_count ?? 0) > 0} label="BigQuery" />
                    <OptionalChip ok={status?.gemini_configured ?? false} label="AI Insights" />
                    <OptionalChip ok={status?.gchat_configured ?? false} label="Google Chat" />
                  </Box>

                  {(!status?.oauth_configured || !status?.gemini_configured || !status?.gchat_configured) && (
                    <>
                      <Divider />
                      <Typography variant="body2" fontWeight={500}>Optional integrations you can configure later:</Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
                        {!status?.oauth_configured && (
                          <li><Typography variant="body2">
                            <strong>Google Login</strong> — set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>
                          </Typography></li>
                        )}
                        {!status?.gemini_configured && (
                          <li><Typography variant="body2">
                            <strong>AI Insights</strong> — set <code>GEMINI_API_KEY</code> to enable one-click table analysis
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
