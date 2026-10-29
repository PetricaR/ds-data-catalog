import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import {
  Alert, Box, Button, CircularProgress, Link, MenuItem, Skeleton, TextField, Typography,
} from '@mui/material'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import SendOutlinedIcon from '@mui/icons-material/SendOutlined'
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorDetail } from '../api/client'
import { settingsApi, type AppSettings, type AppSettingsUpdate, type SettingState } from '../api/settings'
import { MONO, MetaPill, PageHeader } from '../components/ui'
import { tokens } from '../theme'

// Lists are stored comma-separated and edited one per line
const toLines = (csv: string | null) => (csv ?? '').split(',').map((s) => s.trim()).filter(Boolean).join('\n')

function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data)
      qc.invalidateQueries({ queryKey: ['setup-status'] })
    },
    onError: () => {},
  })
}

function StatusPill({ state, env }: { state: SettingState; env: string }) {
  if (state.source === 'environment') {
    return <MetaPill icon={<LockOutlinedIcon />} title={`Set by ${env} in the backend's environment. Change it there.`}>Set in environment</MetaPill>
  }
  if (state.configured) return <MetaPill tone="success" icon={<CheckCircleIcon />}>On</MetaPill>
  return <MetaPill>Off</MetaPill>
}

function EnvNote({ env }: { env: string }) {
  return (
    <Alert severity="info" icon={<LockOutlinedIcon fontSize="small" />} sx={{ mb: 2 }}>
      <Box component="code" sx={MONO}>{env}</Box> is set in the backend's environment, which wins over this page.
      Change it there, or remove it and restart the backend to manage it here.
    </Alert>
  )
}

function SettingsCard({ title, icon, status, intro, children }: {
  title: string
  icon: ReactElement
  status?: ReactNode
  intro: ReactNode
  children: ReactNode
}) {
  return (
    <Box component="section" aria-label={title} sx={{ border: `1px solid ${tokens.rule}`, borderRadius: `${tokens.radiusLg}px`, bgcolor: tokens.surface, px: { xs: 2, sm: 2.5 }, py: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Box aria-hidden sx={{ display: 'flex', color: tokens.ink3 }}>{icon}</Box>
        <Typography variant="h6" component="h2" sx={{ flex: 1 }}>{title}</Typography>
        {status}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>{intro}</Typography>
      {children}
    </Box>
  )
}

function SaveRow({ pending, disabled, children }: { pending: boolean; disabled: boolean; children?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 2 }}>
      <Button type="submit" variant="contained" disabled={disabled || pending}>
        {pending ? <CircularProgress size={18} color="inherit" /> : 'Save'}
      </Button>
      {children}
    </Box>
  )
}

function AccessCard({ settings }: { settings: AppSettings }) {
  const save = useSaveSettings()
  const fromSettings = (s: AppSettings) => ({
    domains: toLines(s.allowed_email_domains.value),
    emails: toLines(s.allowed_emails.value),
    role: (s.default_role.value ?? 'viewer') as 'viewer' | 'editor',
  })
  const [form, setForm] = useState(() => fromSettings(settings))
  const saved = fromSettings(settings)
  const envDomains = settings.allowed_email_domains.source === 'environment'
  const envEmails = settings.allowed_emails.source === 'environment'
  const envRole = settings.default_role.source === 'environment'

  const changes: AppSettingsUpdate = {}
  if (!envDomains && form.domains.trim() !== saved.domains) changes.allowed_email_domains = form.domains
  if (!envEmails && form.emails.trim() !== saved.emails) changes.allowed_emails = form.emails
  if (!envRole && form.role !== saved.role) changes.default_role = form.role
  const dirty = Object.keys(changes).length > 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(changes, { onSuccess: (data) => setForm(fromSettings(data)) })
  }

  return (
    <SettingsCard
      title="Sign-in access"
      icon={<VpnKeyOutlinedIcon />}
      intro="Who can sign in with Google, and the role they get the first time. Change a person's role later on the Users page."
    >
      <Box component="form" onSubmit={submit}>
        {save.isError && <Alert severity="error" sx={{ mb: 2 }}>{errorDetail(save.error, 'Could not save the access settings.')}</Alert>}
        {save.isSuccess && !dirty && <Alert severity="success" sx={{ mb: 2 }}>Saved. It applies from the next sign-in.</Alert>}

        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" component="h3">Admins</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Always allowed, and made admins when they sign in. Set by <Box component="code" sx={MONO}>ADMIN_EMAILS</Box> in
            the backend's environment, so nobody can lock the catalog's owners out from here.
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {settings.admin_emails.length
              ? settings.admin_emails.map((email) => <MetaPill key={email} mono>{email}</MetaPill>)
              : <MetaPill tone="warning">None set</MetaPill>}
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField
            label="Allowed domains"
            placeholder={'example.com\nexample.org'}
            multiline minRows={3}
            value={form.domains}
            onChange={(e) => setForm({ ...form, domains: e.target.value })}
            disabled={envDomains}
            helperText={envDomains ? 'Set by ALLOWED_EMAIL_DOMAINS in the environment' : 'One per line. Anyone with a verified Google account on these domains can sign in.'}
            InputProps={{ sx: MONO }}
          />
          <TextField
            label="Allowed accounts"
            placeholder="partner@agency.io"
            multiline minRows={3}
            value={form.emails}
            onChange={(e) => setForm({ ...form, emails: e.target.value })}
            disabled={envEmails}
            helperText={envEmails ? 'Set by ALLOWED_EMAILS in the environment' : 'One per line. Individual Google accounts outside those domains.'}
            InputProps={{ sx: MONO }}
          />
        </Box>
        <TextField
          select
          label="Role for new users"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as 'viewer' | 'editor' })}
          disabled={envRole}
          helperText={envRole ? 'Set by DEFAULT_ROLE in the environment' : 'Admins are made on the Users page, or by ADMIN_EMAILS.'}
          sx={{ mt: 2, minWidth: 240 }}
        >
          <MenuItem value="viewer">Viewer: browse and search</MenuItem>
          <MenuItem value="editor">Editor: also edit and run scans</MenuItem>
        </TextField>
        {!(envDomains && envEmails && envRole) && <SaveRow pending={save.isPending} disabled={!dirty} />}
      </Box>
    </SettingsCard>
  )
}

/** A secret the API never sends back: enter a new value to replace it, or remove it. */
function SecretCard({ settings, field, env, title, icon, intro, label, replaceLabel, placeholder, password = false, helper, actions }: {
  settings: AppSettings
  field: 'google_chat_webhook_url' | 'gemini_api_key'
  env: string
  title: string
  icon: ReactElement
  intro: ReactNode
  label: string
  replaceLabel: string
  placeholder: string
  password?: boolean
  helper: ReactNode
  actions?: ReactNode
}) {
  const state = settings[field]
  const save = useSaveSettings()
  const [value, setValue] = useState('')
  const [notice, setNotice] = useState('')
  const fromEnv = state.source === 'environment'

  const store = (next: string, done: string) => {
    setNotice('')
    save.mutate({ [field]: next }, { onSuccess: () => { setValue(''); setNotice(done) } })
  }

  return (
    <SettingsCard title={title} icon={icon} status={<StatusPill state={state} env={env} />} intro={intro}>
      {fromEnv ? <EnvNote env={env} /> : (
        <Box component="form" onSubmit={(e) => { e.preventDefault(); store(value.trim(), 'Saved.') }}>
          {save.isError && <Alert severity="error" sx={{ mb: 2 }}>{errorDetail(save.error, 'Could not save this setting.')}</Alert>}
          {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
          <TextField
            fullWidth
            label={state.configured ? replaceLabel : label}
            placeholder={placeholder}
            type={password ? 'password' : 'text'}
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            helperText={state.configured ? 'Stored encrypted and never shown again. Enter a new value to replace it.' : helper}
            inputProps={{ spellCheck: false }}
            InputProps={{ sx: MONO }}
          />
          <SaveRow pending={save.isPending} disabled={!value.trim()}>
            {state.configured && (
              <Button color="error" disabled={save.isPending} onClick={() => store('', 'Removed.')}>Remove</Button>
            )}
          </SaveRow>
        </Box>
      )}
      {actions}
    </SettingsCard>
  )
}

function GoogleChatCard({ settings }: { settings: AppSettings }) {
  const test = useMutation({ mutationFn: settingsApi.testGoogleChat, onError: () => {} })
  const configured = settings.google_chat_webhook_url.configured
  return (
    <SecretCard
      settings={settings}
      field="google_chat_webhook_url"
      env="GOOGLE_CHAT_WEBHOOK_URL"
      title="Google Chat alerts"
      icon={<ForumOutlinedIcon />}
      intro="Posts a card to a Chat space when a table is marked trusted or loses it, metadata changes, a DLP scan finds PII, or a quality score comes in."
      label="Webhook URL"
      replaceLabel="New webhook URL"
      placeholder="https://chat.googleapis.com/v1/spaces/…"
      helper={<>In the Chat space, open <strong>Apps &amp; integrations → Webhooks</strong> and copy the URL of a new webhook.</>}
      actions={configured && (
        <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${tokens.rule}`, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={test.isPending ? <CircularProgress size={14} /> : <SendOutlinedIcon />}
            disabled={test.isPending}
            onClick={() => test.mutate()}
          >
            Send a test message
          </Button>
          {test.isSuccess && <Typography variant="body2" sx={{ color: tokens.success }} role="status">Sent. Check the Chat space.</Typography>}
          {test.isError && <Typography variant="body2" sx={{ color: tokens.danger }} role="alert">{errorDetail(test.error, 'The message did not go through.')}</Typography>}
        </Box>
      )}
    />
  )
}

function GeminiCard({ settings }: { settings: AppSettings }) {
  return (
    <SecretCard
      settings={settings}
      field="gemini_api_key"
      env="GEMINI_API_KEY"
      title="Gemini API key"
      icon={<AutoAwesomeOutlinedIcon />}
      intro="AI insights on table pages. Without a key they run on Vertex AI in the table's project, with the backend's Google credentials."
      label="API key"
      replaceLabel="New API key"
      placeholder="AIza…"
      password
      helper={<>Create one in <Link href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</Link>.</>}
    />
  )
}

export default function Settings() {
  const { data, isLoading, error } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })

  return (
    <Box>
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        subtitle="Who can sign in, and the optional Google Chat and Gemini integrations. A variable set in the backend's environment wins, and shows here as read-only."
      />
      {isLoading && <Skeleton variant="rounded" height={320} />}
      {error && <Alert severity="error">{errorDetail(error, 'Could not load the settings.')}</Alert>}
      {data && (
        <>
          <AccessCard settings={data} />
          <GoogleChatCard settings={data} />
          <GeminiCard settings={data} />
        </>
      )}
    </Box>
  )
}
