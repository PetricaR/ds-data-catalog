import { useState, useEffect, type FormEvent, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Collapse, Divider, Paper, Step,
  StepContent, StepLabel, Stepper, TextField, Typography, type StepIconProps,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import CheckIcon from '@mui/icons-material/Check'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import StorageIcon from '@mui/icons-material/Storage'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined'
import SyncIcon from '@mui/icons-material/Sync'
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined'
import { authApi } from '../api/auth'
import { bqApi, type ProjectInfo } from '../api/bq'
import { errorDetail } from '../api/client'
import { setupApi, type SetupStatus } from '../api/setup'
import { Wordmark } from '../components/Brand'
import ProjectPicker from '../components/ProjectPicker'
import { SyncProgressList, useSourceSync } from '../components/SourceSync'
import { MetaPill, MONO } from '../components/ui'
import { isAdmin, useAuth } from '../contexts/AuthContext'
import { tokens } from '../theme'

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
      {error && <Alert severity="error">{error}</Alert>}
      <Button
        type="submit"
        variant="outlined"
        disabled={!ready || saving}
        startIcon={saving ? <CircularProgress size={16} /> : <LockOutlinedIcon />}
        sx={{ alignSelf: 'flex-start' }}
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
      <Alert severity="warning">
        Signed in as <strong>{user.email}</strong> ({user.role}). Ask an admin to finish setup.
      </Alert>
    )
  }
  return (
    <Alert
      severity="info"
      action={
        <Button
          size="small"
          variant="contained"
          onClick={() => {
            authApi.setReturnTo('/setup')
            window.location.href = '/api/v1/auth/login'
          }}
        >
          Sign in
        </Button>
      }
    >
      Sign in with an admin account (listed in <code>ADMIN_EMAILS</code>) to connect BigQuery projects.
    </Alert>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return <MetaPill tone={ok ? 'success' : 'danger'} icon={ok ? <CheckCircleIcon /> : <ErrorIcon />}>{label}</MetaPill>
}

function OptionalChip({ ok, label }: { ok: boolean; label: string }) {
  return <MetaPill tone={ok ? 'success' : 'warning'} icon={ok ? <CheckCircleIcon /> : <WarningAmberIcon />}>{label}</MetaPill>
}

function CodeBlock({ children }: { children: string }) {
  return (
    <Box
      component="pre"
      sx={{
        bgcolor: tokens.paper2, border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radius}px`, p: 1.5, my: 0.5,
        ...MONO, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: tokens.ink,
      }}
    >
      {children}
    </Box>
  )
}

const STEP_ICONS: ReactElement[] = [<StorageIcon />, <LockOutlinedIcon />, <CloudOutlinedIcon />, <SyncIcon />, <RocketLaunchOutlinedIcon />]

// Shows each step's own icon, and its state: done (check), current (filled) or ahead (muted)
function SetupStepIcon({ active, completed, icon }: StepIconProps) {
  const fill = completed ? tokens.successWash : active ? tokens.accent : tokens.paper2
  const color = completed ? tokens.success : active ? '#ffffff' : tokens.ink3
  return (
    <Box sx={{
      width: 32, height: 32, borderRadius: `${tokens.radius}px`, display: 'grid', placeItems: 'center',
      bgcolor: fill, color, border: `1px solid ${completed ? tokens.successRule : active ? tokens.accent : tokens.rule}`,
      '& svg': { fontSize: 18 },
    }}>
      {completed ? <CheckIcon /> : STEP_ICONS[Number(icon) - 1]}
    </Box>
  )
}

const ERROR_BOX = { bgcolor: tokens.dangerWash, border: `1px solid ${tokens.dangerRule}`, borderRadius: `${tokens.radiusLg}px`, p: 1.5 } as const

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
  const sync = useSourceSync()
  const syncing = sync.running
  const syncRows = sync.rows
  const syncError = sync.error
  const syncDone = sync.done

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
    await sync.run()
    setupApi.status().then(setStatus).catch(() => {})
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loadingStatus) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: tokens.paper }}>
        <CircularProgress aria-label="Loading setup status" />
      </Box>
    )
  }

  return (
    <Box component="main" sx={{ minHeight: '100vh', bgcolor: tokens.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', py: { xs: 4, sm: 6 }, px: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 680, mb: 3 }}>
        <Wordmark size={28} />
      </Box>

      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 680, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 2.5, sm: 4 }, pt: 3, pb: 2.5, borderBottom: `1px solid ${tokens.rule}` }}>
          <Typography variant="overline" component="p" sx={{ color: tokens.accent }}>Setup</Typography>
          <Typography variant="h5" component="h1" sx={{ mt: 0.5 }}>Let's get your catalog running</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Five short steps: check the server, connect Google sign-in, pick BigQuery projects and run the first sync.
          </Typography>
        </Box>

        <Box sx={{ px: { xs: 2.5, sm: 4 }, py: 3 }}>
          <Stepper activeStep={activeStep} orientation="vertical" sx={{ '& .MuiStepConnector-line': { minHeight: 12, borderColor: tokens.rule }, '& .MuiStepConnector-root': { ml: '15px' }, '& .MuiStepContent-root': { ml: '15px', borderColor: tokens.rule } }}>

            {/* ── Step 0: System Check ────────────────────────────────────────── */}
            <Step completed={activeStep > 0}>
              <StepLabel StepIconComponent={SetupStepIcon}>
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
                    <Box sx={ERROR_BOX}>
                      <Typography variant="body2" fontWeight={500}>
                        Cannot connect to the database. Check that PostgreSQL is running and DATABASE_URL is correct.
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Button
                  variant="contained"
                  disabled={!status?.database_connected}
                  onClick={() => setActiveStep(1)}
                  
                >
                  Continue
                </Button>
              </StepContent>
            </Step>

            {/* ── Step 1: Google OAuth ─────────────────────────────────────────── */}
            <Step completed={activeStep > 1}>
              <StepLabel StepIconComponent={SetupStepIcon}>
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
                    <Box sx={ERROR_BOX}>
                      <Typography variant="body2" fontWeight={600}>
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
                        sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
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
                    
                  >
                    Continue
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* ── Step 2: Add BQ Sources ────────────────────────────────────────── */}
            <Step completed={activeStep > 2 || sourceAdded || sourcesCount > 0}>
              <StepLabel StepIconComponent={SetupStepIcon}>
                <Typography fontWeight={600}>Connect BigQuery</Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                  {sourcesCount > 0 && !sourceAdded ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon fontSize="small" sx={{ color: tokens.success }} />
                      <Typography variant="body2" fontWeight={500}>
                        {sourcesCount} BigQuery source{sourcesCount > 1 ? 's' : ''} already connected.
                      </Typography>
                    </Box>
                  ) : sourceAdded ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon fontSize="small" sx={{ color: tokens.success }} />
                      <Typography variant="body2" fontWeight={500}>
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
                        startIcon={addingSource && !manualEntry ? <CircularProgress size={16} /> : <CloudOutlinedIcon />}
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        {`Add ${selectedProjects.length || ''} Project${selectedProjects.length === 1 ? '' : 's'}`}
                      </Button>

                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setManualEntry(m => !m)}
                        sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
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
                            startIcon={addingSource && manualEntry ? <CircularProgress size={16} /> : <CloudOutlinedIcon />}
                            sx={{ alignSelf: 'flex-start' }}
                          >
                            {addingSource && manualEntry ? 'Adding…' : 'Add Project'}
                          </Button>
                        </Box>
                      </Collapse>
                    </>
                  )}
                  {sourceError && <Alert severity="error">{sourceError}</Alert>}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    disabled={sourcesCount === 0 && !sourceAdded}
                    onClick={() => setActiveStep(3)}
                    
                  >
                    Continue
                  </Button>
                  {sourcesCount === 0 && !sourceAdded && (
                    <Button variant="text" onClick={() => setActiveStep(3)} sx={{ color: 'text.secondary' }}>
                      Skip
                    </Button>
                  )}
                </Box>
              </StepContent>
            </Step>

            {/* ── Step 3: Sync Data ─────────────────────────────────────────────── */}
            <Step completed={activeStep > 3 || syncDone || status?.has_data}>
              <StepLabel StepIconComponent={SetupStepIcon}>
                <Typography fontWeight={600}>Sync Data from BigQuery</Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                  {status?.has_data && !syncRows.length ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <CheckCircleIcon fontSize="small" sx={{ color: tokens.success }} />
                      <Typography variant="body2" fontWeight={500}>
                        Data is already synced. Your catalog has datasets and tables.
                      </Typography>
                    </Box>
                  ) : syncRows.length ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {syncDone && (
                        <Typography variant="body2" fontWeight={500}>Sync finished.</Typography>
                      )}
                      <SyncProgressList rows={syncRows} />
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
                        sx={{ alignSelf: 'flex-start' }}
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
                  {syncError && <Alert severity="error">{syncError}</Alert>}
                </Box>
                <Button
                  variant="contained"
                  disabled={syncing}
                  onClick={() => setActiveStep(4)}
                  
                >
                  Continue
                </Button>
              </StepContent>
            </Step>

            {/* ── Step 4: Done ──────────────────────────────────────────────────── */}
            <Step>
              <StepLabel StepIconComponent={SetupStepIcon}>
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
                  startIcon={<RocketLaunchOutlinedIcon />}
                  onClick={() => navigate('/browse')}
                  
                >
                  Open Light Data Catalog
                </Button>
              </StepContent>
            </Step>

          </Stepper>
        </Box>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 3 }}>
        You can come back to this page any time at <Box component="code" sx={MONO}>/setup</Box>.
      </Typography>
    </Box>
  )
}
